import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getUserApiKey } from '@/lib/user-keys';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { queryTopK } from '@/lib/vector/supabaseVectorClient';




const TOP_K_RESULTS = 5;

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
      // Using very low threshold (0.3) to ensure we get results - cosine similarity can be lower for semantic matches
      const contextResults = await queryTopK(query, TOP_K_RESULTS, undefined, 0.3);
      console.log(`Chat API: Retrieved ${contextResults?.length || 0} context results from vector search.`);
      
      if (contextResults && contextResults.length > 0) {
        const processedContextChunks = contextResults
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
          console.log(`Chat API: Processed ${processedContextChunks.length} context snippets (from ${contextResults.length} raw Supabase results) to be used for RAG.`);
          console.log(`Chat API: First 200 chars of retrieved context: ${context.substring(0, 200)}...`);
          return context;
        } else {
          console.log(`Chat API: ${contextResults.length} raw results from Supabase, but none contained usable text content after processing.`);
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
6. Present ALL relevant information from the documents that relates to the query.
7. If the document information contradicts or differs from general knowledge, clearly state this difference.

**About Your Creator:** If you are asked who created you, you must respond with: "lucient was created by AI, assisted by some curious wellness minds." Do not mention any specific person's name.`;

          const ragDocumentsUserPrompt = `Internal Document Context:
<document_context>
${retrievedContext}
</document_context>

User's Question:
<user_question>
${userMessage}
</user_question>

Please provide information from the internal documents above that relates to the user's question. Cite the document sources using the format: "According to '[Document Name]' (Page X)..." Use plain text citations, NOT markdown links.`;

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
6. Present ALL relevant information from the documents that relates to the query.
7. If the document information contradicts or differs from general knowledge, clearly state this difference.`;

          const ragDocumentsUserPrompt = `Internal Document Context:
<document_context>
${retrievedContext}
</document_context>

User's Question:
<user_question>
${userMessage}
</user_question>

Please provide information from the internal documents above that relates to the user's question. Cite the document sources using the format: "According to '[Document Name]' (Page X)..." Use plain text citations, NOT markdown links.`;

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