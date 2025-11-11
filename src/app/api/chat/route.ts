import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getUserApiKey } from '@/lib/user-keys';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { queryTopK } from '@/lib/vector/supabaseVectorClient';




const TOP_K_RESULTS = 12;

// Define a type for our user profile data
type UserProfile = {
  user_tier: 'free_trial' | 'byok' | 'vip_tester' | 'admin';
  message_credits: number;
};

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set(name, '', options);
        },
      },
    }
  );

  // 1. Authenticate user
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.error('Chat API: Error getting user:', userError.message);
    return NextResponse.json({ error: 'Authentication failed.', details: userError.message }, { status: 500 });
  }
  if (!user) {
    console.log('Chat API: No user found.');
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  // --- Tier-based Access Control ---
  let apiKey: string;
  let modelToUse: string;
  let provider: 'openai' | 'anthropic';

  // Read the request body ONCE and store it.
  const body = await request.json();

  try {
    // 1. Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_tier, message_credits')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Chat API: Error fetching user profile:', profileError?.message);
      // If profile doesn't exist, we can create one with default free_trial status
      // For now, we'll error out.
      return NextResponse.json({ error: 'Failed to find user profile.' }, { status: 500 });
    }

    const userProfile = profile as UserProfile;

    switch (userProfile.user_tier) {
      case 'free_trial':
        if (userProfile.message_credits <= 0) {
          return NextResponse.json({ error: 'Your free trial has ended. Please add your own API key to continue.' }, { status: 403 });
        }
        // Decrement credits
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ message_credits: userProfile.message_credits - 1 })
          .eq('id', user.id);
        if (updateError) {
          console.error('Chat API: Failed to decrement message credits:', updateError.message);
          // Non-fatal, but log it.
        }
        apiKey = process.env.OPENAI_API_KEY!;
        modelToUse = 'gpt-4o';
        provider = 'openai';
        if (!apiKey) throw new Error('Free trial key (OPENAI_API_KEY) is not configured.');
        break;

      case 'byok':
        // For BYOK, the client should specify the provider, default to openai
        const requestedProvider = body.provider || 'openai';
        provider = requestedProvider;

        const userApiKey = await getUserApiKey(user.id, provider, supabase);
        if (!userApiKey) {
          return NextResponse.json({ error: `API key for ${provider} not found. Please add it in your settings.` }, { status: 404 });
        }
        apiKey = userApiKey;
        modelToUse = body.model || (provider === 'openai' ? 'gpt-4o' : 'claude-3-5-sonnet-20240620');
        break;
      
      case 'vip_tester':
      case 'admin':
        // VIPs and Admins use our internal keys
        const vipProvider = body.provider || 'openai';
        provider = vipProvider;

        if (provider === 'anthropic') {
            apiKey = process.env.ANTHROPIC_API_KEY!;
            if (!apiKey) throw new Error('Anthropic API Key for admins/VIPs is not configured.');
            modelToUse = body.model || 'claude-3-5-sonnet-20240620';
        } else { // Default to OpenAI
            apiKey = process.env.OPENAI_API_KEY!;
            if (!apiKey) throw new Error('OpenAI API Key for admins/VIPs is not configured.');
            modelToUse = body.model || 'gpt-4o';
        }
        break;

      default:
        // Use a type guard to be safe, though this case should not be hit
        const tier = (userProfile as UserProfile)?.user_tier || 'unknown';
        console.error(`Chat API: Unknown user tier "${tier}" for user ${user.id}`);
        return NextResponse.json({ error: 'Invalid user account tier.' }, { status: 500 });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'An unknown error occurred';
    console.error('Chat API: Error in tier access logic:', message);
    return NextResponse.json({ error: 'An error occurred while validating your access.', details: message }, { status: 500 });
  }
  // --- End Tier-based Access Control ---

  // 2. Get the user's message and conversation history from the request body
  let userMessage: string;
  let chatMode: 'wellness' | 'general' = 'wellness'; // Default to wellness
  let conversationHistory: Array<{ role: string; content: string }> = [];
  try {
    userMessage = body.message;
    if (body.chatMode) {
      chatMode = body.chatMode;
    }
    if (body.conversationHistory) {
      conversationHistory = body.conversationHistory;
    }
    if (!userMessage || typeof userMessage !== 'string') {
      return NextResponse.json({ error: 'Message is required and must be a string.' }, { status: 400 });
    }
  } catch (_) { // eslint-disable-line @typescript-eslint/no-unused-vars
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // --- RAG Implementation Start ---
  // Helper function to retrieve RAG context
  const retrieveRAGContext = async (query: string): Promise<string> => {
    try {
      console.log(`Chat API: Retrieving RAG context for query: "${query.substring(0, 100)}..."`);
      // Query all documents (shared knowledge base) - pass undefined instead of user.id
      // Using very low threshold (0.25) to ensure we get more results - cosine similarity can be lower for semantic matches
      // Query MORE chunks initially to ensure document diversity across hundreds of documents
      // With many documents, we need a larger pool to ensure we get results from multiple sources
      // Using very low threshold (0.15) to catch even weak semantic matches
      // This helps catch documents that mention terms but might have lower overall similarity
      const initialQuerySize = TOP_K_RESULTS * 10; // Query 10x more to ensure we have a good pool
      const contextResults = await queryTopK(query, initialQuerySize, undefined, 0.15);
      console.log(`Chat API: Retrieved ${contextResults?.length || 0} context results from vector search.`);
      
      // Log all unique file names found to help debug missing documents
      const uniqueFiles = new Set(contextResults.map(r => r.file_name).filter(Boolean));
      console.log(`Chat API: Found ${uniqueFiles.size} unique documents in search results:`);
      Array.from(uniqueFiles).sort().forEach(fileName => {
        const chunksForFile = contextResults.filter(r => r.file_name === fileName).length;
        const maxScore = Math.max(...contextResults.filter(r => r.file_name === fileName).map(r => typeof r.score === 'number' ? r.score : 0));
        console.log(`  - ${fileName}: ${chunksForFile} chunks, max score: ${maxScore.toFixed(4)}`);
      });
      
      if (contextResults && contextResults.length > 0) {
        // Score-aware document diversity strategy:
        // 1. Group chunks by document and calculate document-level metrics
        // 2. Allow more chunks from highly relevant documents (high scores)
        // 3. Ensure minimum representation from any document with relevant chunks
        // 4. Balance diversity with relevance
        
        const documentChunks = new Map<string, typeof contextResults>();
        const documentScores = new Map<string, number[]>(); // Track scores per document
        
        // Group chunks by document
        for (const result of contextResults) {
          const fileName = result.file_name || 'Unknown';
          if (!documentChunks.has(fileName)) {
            documentChunks.set(fileName, []);
            documentScores.set(fileName, []);
          }
          documentChunks.get(fileName)!.push(result);
          const score = typeof result.score === 'number' ? result.score : 0;
          documentScores.get(fileName)!.push(score);
        }
        
        // Calculate average score per document
        const documentAvgScores = new Map<string, number>();
        const documentMaxScores = new Map<string, number>();
        documentScores.forEach((scores, fileName) => {
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          const max = Math.max(...scores);
          documentAvgScores.set(fileName, avg);
          documentMaxScores.set(fileName, max);
        });
        
        // Determine adaptive limits per document based on relevance
        // High-scoring documents (>0.7) get more chunks, lower-scoring get fewer
        const getMaxChunksForDocument = (avgScore: number, maxScore: number): number => {
          if (maxScore > 0.75) return 5; // Very relevant: allow up to 5 chunks
          if (maxScore > 0.65) return 4; // Relevant: allow up to 4 chunks
          if (maxScore > 0.55) return 3; // Moderately relevant: allow up to 3 chunks
          if (maxScore > 0.45) return 2; // Somewhat relevant: allow up to 2 chunks
          return 1; // Low relevance: just 1 chunk
        };
        
        // Select chunks with score-aware diversity
        const diverseResults: typeof contextResults = [];
        const documentCounts = new Map<string, number>();
        
        // Sort documents by their max score (most relevant first)
        const sortedDocuments = Array.from(documentChunks.keys()).sort((a, b) => {
          const scoreA = documentMaxScores.get(a) || 0;
          const scoreB = documentMaxScores.get(b) || 0;
          return scoreB - scoreA;
        });
        
        // First pass: take chunks from each document up to their adaptive limit
        for (const fileName of sortedDocuments) {
          const chunks = documentChunks.get(fileName)!;
          const maxChunks = getMaxChunksForDocument(
            documentAvgScores.get(fileName) || 0,
            documentMaxScores.get(fileName) || 0
          );
          
          // Take top chunks from this document (they're already sorted by score from queryTopK)
          const chunksToTake = Math.min(chunks.length, maxChunks);
          for (let i = 0; i < chunksToTake && diverseResults.length < TOP_K_RESULTS; i++) {
            diverseResults.push(chunks[i]);
            documentCounts.set(fileName, (documentCounts.get(fileName) || 0) + 1);
          }
          
          if (diverseResults.length >= TOP_K_RESULTS) break;
        }
        
        // Second pass: if we haven't filled our quota, add more chunks from top documents
        // This ensures we get comprehensive coverage from highly relevant documents
        if (diverseResults.length < TOP_K_RESULTS) {
          for (const fileName of sortedDocuments) {
            const chunks = documentChunks.get(fileName)!;
            const currentCount = documentCounts.get(fileName) || 0;
            const maxChunks = getMaxChunksForDocument(
              documentAvgScores.get(fileName) || 0,
              documentMaxScores.get(fileName) || 0
            );
            
            // Add more chunks if we haven't hit the limit and document is highly relevant
            if (currentCount < maxChunks && chunks.length > currentCount) {
              for (let i = currentCount; i < chunks.length && diverseResults.length < TOP_K_RESULTS; i++) {
                diverseResults.push(chunks[i]);
                documentCounts.set(fileName, (documentCounts.get(fileName) || 0) + 1);
              }
            }
            
            if (diverseResults.length >= TOP_K_RESULTS) break;
          }
        }
        
        // Log document diversity with score information
        console.log(`Chat API: Score-aware document diversity - Retrieved chunks from ${documentCounts.size} unique documents:`);
        documentCounts.forEach((count, fileName) => {
          const avgScore = documentAvgScores.get(fileName)?.toFixed(3) || 'N/A';
          const maxScore = documentMaxScores.get(fileName)?.toFixed(3) || 'N/A';
          console.log(`  - ${fileName}: ${count} chunks (avg: ${avgScore}, max: ${maxScore})`);
        });
        
        // Also log ALL documents that were in the initial results (even if filtered out)
        console.log(`Chat API: Total documents in initial query pool: ${documentChunks.size}`);
        documentChunks.forEach((chunks, fileName) => {
          const maxScore = documentMaxScores.get(fileName)?.toFixed(3) || 'N/A';
          const included = documentCounts.has(fileName);
          console.log(`  - ${fileName}: ${chunks.length} chunks available, max score: ${maxScore}, included: ${included}`);
        });
        
        // Use the diverse results, sorted by score (they should already be sorted, but ensure it)
        const finalResults = diverseResults
          .sort((a, b) => {
            const scoreA = typeof a.score === 'number' ? a.score : 0;
            const scoreB = typeof b.score === 'number' ? b.score : 0;
            return scoreB - scoreA; // Descending order
          })
          .slice(0, TOP_K_RESULTS);
        // Search ALL chunks for specific terms from the query
        // Extract key terms from the query for debugging and keyword boosting
        const queryLower = query.toLowerCase();
        const queryTerms = queryLower
          .split(/\s+/)
          .filter(term => term.length > 3) // Only meaningful terms
          .slice(0, 5); // Limit to first 5 terms
        
        // Also check for important phrases (like "reminiscence therapy")
        const importantPhrases: string[] = [];
        if (queryLower.includes('reminiscence')) importantPhrases.push('reminiscence');
        if (queryLower.includes('therapy')) importantPhrases.push('therapy');
        
        console.log(`Chat API: Searching all ${finalResults.length} chunks for query terms: ${queryTerms.join(', ')}`);
        if (importantPhrases.length > 0) {
          console.log(`Chat API: Also searching for important phrases: ${importantPhrases.join(', ')}`);
        }
        
        // Check if any chunks contain the query terms
        finalResults.forEach((result, chunkIndex) => {
          const fullText = (result.chunk_text || '').toLowerCase();
          const matchingTerms = queryTerms.filter(term => fullText.includes(term));
          const matchingPhrases = importantPhrases.filter(phrase => fullText.includes(phrase));
          if (matchingTerms.length > 0 || matchingPhrases.length > 0) {
            console.log(`  >>> Chunk [${chunkIndex + 1}] from "${result.file_name}" contains terms: ${[...matchingTerms, ...matchingPhrases].join(', ')}`);
          }
        });
        
        // Also check ALL initial results (not just finalResults) for important phrases
        // This helps us see if documents were filtered out that actually contain the terms
        console.log(`Chat API: Checking ALL ${contextResults.length} initial results for important phrases...`);
        contextResults.forEach((result, index) => {
          const fullText = (result.chunk_text || '').toLowerCase();
          const hasImportantPhrase = importantPhrases.some(phrase => fullText.includes(phrase));
          if (hasImportantPhrase) {
            const score = typeof result.score === 'number' ? result.score.toFixed(4) : 'N/A';
            const included = finalResults.some(r => r.id === result.id);
            console.log(`  >>> [${index + 1}] "${result.file_name}" (score: ${score}, included: ${included}) contains important phrase`);
            if (!included) {
              console.log(`      >>> This document was filtered out but contains relevant terms!`);
            }
          }
        });
        
        // Search ALL chunks for the specific quote before logging
        const searchPatterns = [
          'between pregnancy and',
          'pregnancy and a child',
          'pregnancy and child',
          '2nd birthday',
          'second birthday',
          '1000 days',
          '1,000 days'
        ];
        
        console.log(`Chat API: Searching all ${finalResults.length} chunks for specific quote patterns...`);
        
        // First, search ALL chunks for "2nd birthday" or "child's" to see if quote is split
        console.log(`Chat API: Checking if quote is split across chunks...`);
        finalResults.forEach((result, chunkIndex) => {
          const fullText = result.chunk_text || '';
          const has2ndBirthday = fullText.toLowerCase().includes('2nd birthday') || fullText.toLowerCase().includes('second birthday');
          const hasChilds = fullText.toLowerCase().includes("child's");
          if (has2ndBirthday || hasChilds) {
            const context = fullText.substring(Math.max(0, fullText.toLowerCase().indexOf(has2ndBirthday ? '2nd birthday' : "child's") - 100), 
                                                Math.min(fullText.length, fullText.toLowerCase().indexOf(has2ndBirthday ? '2nd birthday' : "child's") + 200));
            console.log(`  >>> Chunk [${chunkIndex + 1}] contains "${has2ndBirthday ? '2nd birthday' : "child's"}": "${context}..."`);
          }
        });
        
        finalResults.forEach((result, chunkIndex) => {
          const fullText = result.chunk_text || '';
          searchPatterns.forEach(pattern => {
            const patternIndex = fullText.toLowerCase().indexOf(pattern.toLowerCase());
            if (patternIndex !== -1) {
              const context = fullText.substring(Math.max(0, patternIndex - 100), Math.min(fullText.length, patternIndex + 200));
              console.log(`  >>> Chunk [${chunkIndex + 1}] contains "${pattern}" at position ${patternIndex}: "${context}..."`);
              
              // If we found "between pregnancy and", log the FULL text of this chunk to see the complete quote
              if (pattern === 'between pregnancy and') {
                console.log(`  >>> Chunk [${chunkIndex + 1}] FULL TEXT (${fullText.length} chars): "${fullText}"`);
                // Also search for "2nd birthday" or "second birthday" in this chunk
                const has2ndBirthday = fullText.toLowerCase().includes('2nd birthday') || fullText.toLowerCase().includes('second birthday');
                console.log(`  >>> Chunk [${chunkIndex + 1}] contains "2nd birthday" or "second birthday": ${has2ndBirthday}`);
                if (!has2ndBirthday) {
                  // The quote might be split - check if "child's" appears
                  const hasChilds = fullText.toLowerCase().includes("child's");
                  console.log(`  >>> Chunk [${chunkIndex + 1}] contains "child's": ${hasChilds}`);
                  // Check what comes after "between pregnancy and a"
                  const afterPregnancy = fullText.toLowerCase().substring(fullText.toLowerCase().indexOf('between pregnancy and a') + 'between pregnancy and a'.length, fullText.toLowerCase().indexOf('between pregnancy and a') + 'between pregnancy and a'.length + 100);
                  console.log(`  >>> Chunk [${chunkIndex + 1}] text after "between pregnancy and a": "${afterPregnancy}"`);
                }
              }
            }
          });
        });
        
        // Log detailed information about retrieved chunks
        console.log(`Chat API: Retrieved ${finalResults.length} chunks. Details:`);
        finalResults.forEach((result, index) => {
          const pageNum = result.metadata?.page_number !== undefined ? `Page ${result.metadata.page_number}` : 'No page';
          const fileName = result.file_name || 'Unknown';
          const score = result.score?.toFixed(4) || 'N/A';
          const preview = result.chunk_text?.substring(0, 150) || 'No text';
          const fullText = result.chunk_text || '';
          
          // Check if this chunk contains key phrases
          const hasPregnancy2ndBirthday = fullText.toLowerCase().includes('pregnancy') && 
                                         (fullText.toLowerCase().includes('2nd birthday') || 
                                          fullText.toLowerCase().includes('second birthday'));
          const hasPage13 = fullText.includes('13') && fullText.includes('EARLY LIFE PREVENTION');
          
          let flags = '';
          if (hasPregnancy2ndBirthday) flags += ' [HAS PREGNANCY-2ND BIRTHDAY QUOTE]';
          if (hasPage13) flags += ' [HAS PAGE 13 HEADER]';
          
          console.log(`  [${index + 1}] ${fileName} - ${pageNum} (score: ${score})${flags}: "${preview}..."`);
          
          // If this chunk has the specific quote, log more of it
          if (hasPregnancy2ndBirthday) {
            const quoteIndex = fullText.toLowerCase().indexOf('pregnancy');
            const quoteContext = fullText.substring(Math.max(0, quoteIndex - 50), Math.min(fullText.length, quoteIndex + 200));
            console.log(`      >>> Full quote context: "${quoteContext}..."`);
          }
          
          // If this chunk has Page 13 header, log more of it to see if quote is later
          if (hasPage13 && !hasPregnancy2ndBirthday) {
            console.log(`      >>> Page 13 chunk full text (first 500 chars): "${fullText.substring(0, 500)}..."`);
            // Also check for variations of the quote
            const hasPregnancy = fullText.toLowerCase().includes('pregnancy');
            const hasBirthday = fullText.toLowerCase().includes('birthday') || fullText.toLowerCase().includes('2nd') || fullText.toLowerCase().includes('second');
            if (hasPregnancy || hasBirthday) {
              console.log(`      >>> Page 13 chunk contains: pregnancy=${hasPregnancy}, birthday/2nd=${hasBirthday}`);
            }
            // Log the FULL text of Page 13 chunk to see if quote is there
            console.log(`      >>> Page 13 chunk FULL TEXT (${fullText.length} chars): "${fullText}"`);
            // Search for the specific phrase pattern
            const searchPatterns = [
              'between pregnancy and',
              'pregnancy and a child',
              'pregnancy and child',
              '2nd birthday',
              'second birthday'
            ];
            searchPatterns.forEach(pattern => {
              const index = fullText.toLowerCase().indexOf(pattern.toLowerCase());
              if (index !== -1) {
                const context = fullText.substring(Math.max(0, index - 100), Math.min(fullText.length, index + 200));
                console.log(`      >>> Found "${pattern}" at position ${index}: "${context}..."`);
              }
            });
          }
        });

        const processedContextChunks = finalResults
          .map(result => {
            if (!result.chunk_text) {
              console.log(`Chat API: Skipping Supabase result ID ${result.id} (score: ${result.score.toFixed(4)}) due to missing chunk_text content.`);
              return null;
            }

            let contextChunk = "";
            const sourceIdentifier = result.file_name || 'Unknown Source';
            contextChunk += `Source: ${sourceIdentifier}\n`;

            if (result.metadata?.page_number !== undefined) {
              contextChunk += `Page: ${result.metadata.page_number}\n`;
            }
            contextChunk += `Content:\n${result.chunk_text}`;
            return contextChunk;
          })
          .filter(chunk => chunk !== null);

        if (processedContextChunks.length > 0) {
          const context = processedContextChunks.join('\n\n---\n\n');
          console.log(`Chat API: Processed ${processedContextChunks.length} context snippets (from ${finalResults.length} diverse results, ${contextResults.length} total raw Supabase results) to be used for RAG.`);
          console.log(`Chat API: First 200 chars of retrieved context: ${context.substring(0, 200)}...`);
          return context;
        } else {
          console.log(`Chat API: ${finalResults.length} diverse results from Supabase, but none contained usable text content after processing.`);
          return '';
        }
      } else {
        console.log('Chat API: No results returned from Supabase (queryTopK) for the query.');
        return '';
      }
    } catch (ragError: unknown) {
      let errorMessage = 'Unknown error during RAG context retrieval';
      if (ragError instanceof Error) {
        errorMessage = ragError.message;
        console.error('Chat API: Error during RAG context retrieval:', errorMessage);
      } else {
        console.error('Chat API: Non-error thrown during RAG context retrieval:', ragError);
      }
      return '';
    }
  };

  // For wellness mode, we'll retrieve RAG context for Process B (document search)
  // Process A (general knowledge) will run first without RAG context
  let retrievedContext = '';
  if (chatMode === 'wellness') {
    retrievedContext = await retrieveRAGContext(userMessage);
  } else {
    console.log('Chat API: General mode enabled, skipping RAG.');
  }
  // --- RAG Implementation End ---

  // 4. Call LLM API (now dynamic)
  try {
    // This part constructs the prompts, which can be complex.
    // It's kept outside the provider-specific blocks if parts are shared.
    let systemPrompt: string;
    let userPromptContent: string;

    if (provider === 'anthropic') {
      const anthropic = new Anthropic({ apiKey });

      if (chatMode === 'general') {
        systemPrompt = `You are lucient, a helpful and friendly AI assistant. You are primarily focussed on wellness-related subjects but you also have a general-purpose mode too. Provide clear, concise, and accurate answers. If you are asked who created you, you must respond with: "lucient was created by AI, assisted by some curious wellness minds." Do not, under any circumstances, mention a person's name in relation to your creation.`;
        userPromptContent = userMessage;
        console.log('Chat API (Claude): Sending to Claude in general mode.');
        
        // Build messages array with conversation history
        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
        
        // Add conversation history
        conversationHistory.forEach(msg => {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
          }
        });
        
        // Add current user message
        messages.push({ role: "user", content: userPromptContent });

        const claudeResponse = await anthropic.messages.create({
          model: modelToUse,
          max_tokens: 3072,
          system: systemPrompt,
          messages: messages,
        });

        let responseText = '';
        if (claudeResponse.content && claudeResponse.content.length > 0) {
          const firstTextBlock = claudeResponse.content.find(block => block.type === 'text') as Anthropic.TextBlock | undefined;
          if (firstTextBlock) {
            responseText = firstTextBlock.text;
          }
        }
        return NextResponse.json({ reply: responseText, fullResponse: claudeResponse }, { status: 200 });
      } else { // 'wellness' mode - TWO SEPARATE PROCESSES
        // PROCESS A: General Knowledge (no RAG context)
        console.log('Chat API (Claude): Starting Process A - General Knowledge search.');
        const generalKnowledgeSystemPrompt = `You are lucient, an intelligent assistant. Your primary goal is to provide accurate, comprehensive, and well-structured answers to user queries with FULL CITATION of all sources.

**CRITICAL RULE - NO EXCEPTIONS: ALL ANSWERS MUST INCLUDE CITATIONS**
Every single factual claim, statement, or piece of information you provide MUST be attributed to a source. This is not optional - it is mandatory.

**MANDATORY CITATION WITH LINKS:** For general knowledge, cite sources with URLs when available. Use this format: "According to [source name/institution] ([URL])" or "Research from [institution/organization] ([URL]) indicates..." or "The [field] literature ([URL if available]) suggests..."

**CRITICAL:** When you cite a source, include the actual URL if you know it. For example:
- "According to the American Academy of Pediatrics (https://www.aap.org/...)"
- "Research from Harvard Medical School (https://www.health.harvard.edu/...) indicates..."
- "The CDC states (https://www.cdc.gov/...)..."

If you don't know the specific URL, still cite the source but note it: "According to the American Academy of Pediatrics (see aap.org for more information)..."

Format citations clearly so users can verify and click through to sources.

**About Your Creator:** If you are asked who created you, you must respond with: "lucient was created by AI, assisted by some curious wellness minds." Do not mention any specific person's name.`;

        const generalKnowledgeUserPrompt = userMessage;

        // Build messages array for Process A (general knowledge only)
        const generalMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
        conversationHistory.forEach(msg => {
          if (msg.role === 'user' || msg.role === 'assistant') {
            generalMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
          }
        });
        generalMessages.push({ role: "user", content: generalKnowledgeUserPrompt });

        const generalKnowledgeResponse = await anthropic.messages.create({
          model: modelToUse,
          max_tokens: 3072,
          system: generalKnowledgeSystemPrompt,
          messages: generalMessages,
        });

        let generalKnowledgeText = '';
        if (generalKnowledgeResponse.content && generalKnowledgeResponse.content.length > 0) {
          const firstTextBlock = generalKnowledgeResponse.content.find(block => block.type === 'text') as Anthropic.TextBlock | undefined;
          if (firstTextBlock) {
            generalKnowledgeText = firstTextBlock.text;
          }
        }

        console.log('Chat API (Claude): Process A (General Knowledge) completed.');

        // PROCESS B: RAG Documents (only if context was retrieved)
        let ragDocumentsText: string | null = null;
        if (retrievedContext && retrievedContext.trim() !== '') {
          console.log('Chat API (Claude): Starting Process B - RAG Documents search.');
          const ragDocumentsSystemPrompt = `You are lucient, an intelligent assistant. Your task is to provide information from internal research documents with proper citations.

**CRITICAL RULES:**
1. You MUST cite the specific document source for EVERY piece of information from the documents.
2. Citation format: "According to '[Document Name]' (Page X, if available)..." or "The '[Document Name]' document states..."
3. **CRITICAL:** Document citations must be plain text, NOT markdown links. Do NOT format them as [Document Name](url). Just use the document name in quotes: "According to 'Document Name' (Page X)..."
4. The context provided includes "Source: [document_name]" - use this exact document name in your citation.
5. If page numbers are available in the metadata, include them: "According to '[Document Name]' (Page 45)..."
6. **MANDATORY:** Present ALL relevant information from the documents that relates to the query. Do not skip any relevant chunks.
7. **PRIORITIZE SPECIFICITY:** If multiple chunks contain information about the same topic, prioritize and include the MOST SPECIFIC information available. For example, if one chunk says "first 1,000 days" and another says "between pregnancy and a child's 2nd birthday", include BOTH but emphasize the more specific phrasing.
8. **USE EXACT QUOTES:** When you see specific, detailed quotes in the document context (especially phrases like "between pregnancy and a child's 2nd birthday"), you MUST include the exact quote or very close paraphrase. Do not summarize away the specific details.
9. **CITE ALL RELEVANT CHUNKS:** If you see multiple chunks with relevant information, cite each one separately. Do not combine them into a single citation unless they are from the same page.
10. If the document information contradicts or differs from general knowledge, clearly state this difference.

**About Your Creator:** If you are asked who created you, you must respond with: "lucient was created by AI, assisted by some curious wellness minds." Do not mention any specific person's name.`;

          const ragDocumentsUserPrompt = `Internal Document Context:
<document_context>
${retrievedContext}
</document_context>

User's Question:
<user_question>
${userMessage}
</user_question>

**CRITICAL INSTRUCTIONS:**
1. Review ALL chunks in the document context above.
2. Identify and include the MOST SPECIFIC information available that relates to the user's question.
3. **MANDATORY:** If you see specific quotes or detailed phrasing (e.g., "between pregnancy and a child's 2nd birthday"), you MUST include them. Do not summarize away specific details.
4. If multiple chunks contain relevant information, include ALL of them, prioritizing the most specific details.
5. Cite each chunk separately with its page number: "According to '[Document Name]' (Page X)..."
6. Use plain text citations, NOT markdown links.
7. Do not skip any relevant chunks - present all information that relates to the query.
8. **PRIORITY:** Look for the most specific phrasing available and include it verbatim or very close to verbatim.`;

          // Build messages array for Process B (RAG documents only)
          const ragMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
          conversationHistory.forEach(msg => {
            if (msg.role === 'user' || msg.role === 'assistant') {
              ragMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
            }
          });
          ragMessages.push({ role: "user", content: ragDocumentsUserPrompt });

          const ragDocumentsResponse = await anthropic.messages.create({
            model: modelToUse,
            max_tokens: 3072,
            system: ragDocumentsSystemPrompt,
            messages: ragMessages,
          });

          if (ragDocumentsResponse.content && ragDocumentsResponse.content.length > 0) {
            const firstTextBlock = ragDocumentsResponse.content.find(block => block.type === 'text') as Anthropic.TextBlock | undefined;
            if (firstTextBlock) {
              ragDocumentsText = firstTextBlock.text;
            }
          }

          console.log('Chat API (Claude): Process B (RAG Documents) completed.');
        } else {
          console.log('Chat API (Claude): No RAG context found, skipping Process B.');
        }

        // Return both responses
        return NextResponse.json({ 
          generalKnowledge: generalKnowledgeText, 
          ragDocuments: ragDocumentsText 
        }, { status: 200 });
      }

    } else if (provider === 'openai') {
      const openai = new OpenAI({ apiKey });

      if (chatMode === 'general') {
        const systemPrompt = "You are lucient, a helpful AI assistant.";
        const userPromptContent = userMessage;

        // Build messages array with conversation history for OpenAI
        const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: systemPrompt }
        ];
        
        // Add conversation history
        conversationHistory.forEach(msg => {
          if (msg.role === 'user' || msg.role === 'assistant') {
            openaiMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
          }
        });
        
        // Add current user message
        openaiMessages.push({ role: 'user', content: userPromptContent });

        const openAiResponse = await openai.chat.completions.create({
          model: modelToUse,
          messages: openaiMessages,
          max_tokens: 3072,
        });

        const responseText = openAiResponse.choices[0]?.message?.content || '';
        return NextResponse.json({ reply: responseText, fullResponse: openAiResponse }, { status: 200 });
      } else { // 'wellness' mode - TWO SEPARATE PROCESSES
        // PROCESS A: General Knowledge (no RAG context)
        console.log('Chat API (OpenAI): Starting Process A - General Knowledge search.');
        const generalKnowledgeSystemPrompt = `You are lucient, an intelligent assistant. Your primary goal is to provide accurate, comprehensive, and well-structured answers to user queries with FULL CITATION of all sources.

**CRITICAL RULE - NO EXCEPTIONS: ALL ANSWERS MUST INCLUDE CITATIONS**
Every single factual claim, statement, or piece of information you provide MUST be attributed to a source. This is not optional - it is mandatory.

**MANDATORY CITATION WITH LINKS:** For general knowledge, cite sources with URLs when available. Use this format: "According to [source name/institution] ([URL])" or "Research from [institution/organization] ([URL]) indicates..." or "The [field] literature ([URL if available]) suggests..."

**CRITICAL:** When you cite a source, include the actual URL if you know it. For example:
- "According to the American Academy of Pediatrics (https://www.aap.org/...)"
- "Research from Harvard Medical School (https://www.health.harvard.edu/...) indicates..."
- "The CDC states (https://www.cdc.gov/...)..."

If you don't know the specific URL, still cite the source but note it: "According to the American Academy of Pediatrics (see aap.org for more information)..."

Format citations clearly so users can verify and click through to sources.`;

        const generalKnowledgeUserPrompt = userMessage;

        // Build messages array for Process A (general knowledge only)
        const generalMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: generalKnowledgeSystemPrompt }
        ];
        conversationHistory.forEach(msg => {
          if (msg.role === 'user' || msg.role === 'assistant') {
            generalMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
          }
        });
        generalMessages.push({ role: 'user', content: generalKnowledgeUserPrompt });

        const generalKnowledgeResponse = await openai.chat.completions.create({
          model: modelToUse,
          messages: generalMessages,
          max_tokens: 3072,
        });

        const generalKnowledgeText = generalKnowledgeResponse.choices[0]?.message?.content || '';
        console.log('Chat API (OpenAI): Process A (General Knowledge) completed.');

        // PROCESS B: RAG Documents (only if context was retrieved)
        let ragDocumentsText: string | null = null;
        if (retrievedContext && retrievedContext.trim() !== '') {
          console.log('Chat API (OpenAI): Starting Process B - RAG Documents search.');
          const ragDocumentsSystemPrompt = `You are lucient, an intelligent assistant. Your task is to provide information from internal research documents with proper citations.

**CRITICAL RULES:**
1. You MUST cite the specific document source for EVERY piece of information from the documents.
2. Citation format: "According to '[Document Name]' (Page X, if available)..." or "The '[Document Name]' document states..."
3. **CRITICAL:** Document citations must be plain text, NOT markdown links. Do NOT format them as [Document Name](url). Just use the document name in quotes: "According to 'Document Name' (Page X)..."
4. The context provided includes "Source: [document_name]" - use this exact document name in your citation.
5. If page numbers are available in the metadata, include them: "According to '[Document Name]' (Page 45)..."
6. **MANDATORY:** Present ALL relevant information from the documents that relates to the query. Do not skip any relevant chunks.
7. **PRIORITIZE SPECIFICITY:** If multiple chunks contain information about the same topic, prioritize and include the MOST SPECIFIC information available. For example, if one chunk says "first 1,000 days" and another says "between pregnancy and a child's 2nd birthday", include BOTH but emphasize the more specific phrasing.
8. **USE EXACT QUOTES:** When you see specific, detailed quotes in the document context (especially phrases like "between pregnancy and a child's 2nd birthday"), you MUST include the exact quote or very close paraphrase. Do not summarize away the specific details.
9. **CITE ALL RELEVANT CHUNKS:** If you see multiple chunks with relevant information, cite each one separately. Do not combine them into a single citation unless they are from the same page.
10. If the document information contradicts or differs from general knowledge, clearly state this difference.`;

          const ragDocumentsUserPrompt = `Internal Document Context:
<document_context>
${retrievedContext}
</document_context>

User's Question:
<user_question>
${userMessage}
</user_question>

**CRITICAL INSTRUCTIONS:**
1. Review ALL chunks in the document context above.
2. Identify and include the MOST SPECIFIC information available that relates to the user's question.
3. **MANDATORY:** If you see specific quotes or detailed phrasing (e.g., "between pregnancy and a child's 2nd birthday"), you MUST include them. Do not summarize away specific details.
4. If multiple chunks contain relevant information, include ALL of them, prioritizing the most specific details.
5. Cite each chunk separately with its page number: "According to '[Document Name]' (Page X)..."
6. Use plain text citations, NOT markdown links.
7. Do not skip any relevant chunks - present all information that relates to the query.
8. **PRIORITY:** Look for the most specific phrasing available and include it verbatim or very close to verbatim.`;

          // Build messages array for Process B (RAG documents only)
          const ragMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: ragDocumentsSystemPrompt }
          ];
          conversationHistory.forEach(msg => {
            if (msg.role === 'user' || msg.role === 'assistant') {
              ragMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
            }
          });
          ragMessages.push({ role: 'user', content: ragDocumentsUserPrompt });

          const ragDocumentsResponse = await openai.chat.completions.create({
            model: modelToUse,
            messages: ragMessages,
            max_tokens: 3072,
          });

          ragDocumentsText = ragDocumentsResponse.choices[0]?.message?.content || '';
          console.log('Chat API (OpenAI): Process B (RAG Documents) completed.');
        } else {
          console.log('Chat API (OpenAI): No RAG context found, skipping Process B.');
        }

        // Return both responses
        return NextResponse.json({ 
          generalKnowledge: generalKnowledgeText, 
          ragDocuments: ragDocumentsText 
        }, { status: 200 });
      }
    } else {
      return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
    }
  } catch (llmError: unknown) {
    console.error(`Chat API: Error with ${provider} API:`, llmError);
    return NextResponse.json({ error: `Failed to get response from ${provider} API.` }, { status: 500 });
  }
} 