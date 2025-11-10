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
  let retrievedContext = '';
  if (chatMode === 'wellness') {
    try {
      console.log(`Chat API: Retrieving context for user message: "${userMessage.substring(0, 100)}..."`);
      // Query all documents (shared knowledge base) - pass undefined instead of user.id
      const contextResults = await queryTopK(userMessage, TOP_K_RESULTS, undefined, 0.5);
      
      if (contextResults && contextResults.length > 0) {
        const processedContextChunks = contextResults
          .map(result => {
            if (!result.chunk_text) {
              console.log(`Chat API (Claude): Skipping Supabase result ID ${result.id} (score: ${result.score.toFixed(4)}) due to missing chunk_text content.`);
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
          retrievedContext = processedContextChunks.join('\n\n---\n\n');
          console.log(`Chat API (Claude): Processed ${processedContextChunks.length} context snippets (from ${contextResults.length} raw Supabase results) to be used for RAG.`);
        } else {
          console.log(`Chat API (Claude): ${contextResults.length} raw results from Supabase, but none contained usable text content after processing.`);
          retrievedContext = '';
        }
      } else {
        console.log('Chat API (Claude): No results returned from Supabase (queryTopK) for the user message.');
      }
    } catch (ragError: unknown) {
      let errorMessage = 'Unknown error during RAG context retrieval';
      if (ragError instanceof Error) {
        errorMessage = ragError.message;
        console.error('Chat API (Claude): Error during RAG context retrieval:', errorMessage);
        if (ragError.stack) {
          // console.error('Chat API (Claude) Stack:', ragError.stack); // Optional: log stack trace
        }
      } else {
        console.error('Chat API (Claude): Non-error thrown during RAG context retrieval:', ragError);
      }
      retrievedContext = 'Error retrieving context. Answering from general knowledge.';
    }
  } else {
    console.log('Chat API (Claude): General mode enabled, skipping RAG.');
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
      } else { // 'wellness' mode
        systemPrompt = `You are lucient, an intelligent assistant. Your primary goal is to provide accurate, comprehensive, and well-structured answers to user queries with FULL CITATION of all sources.

**CRITICAL: ALL ANSWERS MUST INCLUDE CITATIONS**
Every piece of information you provide must be attributed to a source. This is mandatory, not optional.

**Response Structure (When Document Context is Available):**

**Part A: General Knowledge Foundation**
*   Begin with the widely accepted, general understanding of the topic based on your training knowledge.
*   Provide comprehensive context, explain key concepts, discuss related research or theories, and offer illustrative examples.
*   **MANDATORY CITATION WITH LINKS:** For general knowledge, cite sources with URLs when available. Use this format: "According to [source name/institution] ([URL])" or "Research from [institution/organization] ([URL]) indicates..." or "The [field] literature ([URL if available]) suggests..."
*   **CRITICAL:** When you cite a source, include the actual URL if you know it. For example:
    *   "According to the American Academy of Pediatrics (https://www.aap.org/...)"
    *   "Research from Harvard Medical School (https://www.health.harvard.edu/...) indicates..."
    *   "The CDC states (https://www.cdc.gov/...)..."
*   If you don't know the specific URL, still cite the source but note it: "According to the American Academy of Pediatrics (see aap.org for more information)..."
*   Format citations clearly so users can verify and click through to sources.

**Part B: Document-Specific Findings**
*   After presenting general knowledge, present specific information from the internal documents provided to you.
*   Use clear section headers like "According to Our Research Documents:" or "From Our Internal Documents:"
*   **MANDATORY CITATION:** You MUST cite the specific document source for EVERY piece of information from the documents.
*   Citation format: "According to '[Document Name]' (Page X, if available)..." or "The '[Document Name]' document states..."
*   The context provided includes "Source: [document_name]" - use this exact document name in your citation.
*   If page numbers are available in the metadata, include them: "According to '[Document Name]' (Page 45)..."
*   **Note:** Document citations will be formatted as clickable links in the UI, so use the exact document name as provided.
*   Present ALL relevant information from the documents that relates to the query.
*   If the document information contradicts or differs from general knowledge, clearly state this difference.

**Response Structure (When NO Document Context is Available):**
*   Clearly state: "Our internal documents do not contain specific information about this topic."
*   Then provide a comprehensive answer using your general knowledge.
*   **MANDATORY CITATION:** Cite all sources in the format described above.
*   Example: "According to the [relevant institution/organization]..." or "Research from [source] indicates..."

**Special Cases:**
*   **For Country/City Wellness Economy Queries:** Always provide comprehensive data including Size, Per Capita, % of GDP, Rankings, and Growth Trends. Cite sources for all data points.
*   **For Document-Specific Queries:** If the user explicitly asks "What does [document] say about X?", focus primarily on the document content but still provide general context with citations.

**Citation Requirements:**
1.  Every factual claim must have a citation.
2.  Citations must be clear and verifiable.
3.  For document sources, use the exact document name provided in the context (these will be made clickable in the UI).
4.  For general knowledge, cite authoritative sources (institutions, organizations, research bodies) WITH URLs when available.
5.  Format citations consistently throughout your response.
6.  URLs should be included in parentheses immediately after the source name: "According to [Source] ([URL])..."
7.  If a URL is not available, still cite the source but note it: "According to [Source] (see [website] for more information)..."

**About Your Creator:** If you are asked who created you, you must respond with: "lucient was created by AI, assisted by some curious wellness minds." Do not mention any specific person's name.`;

        userPromptContent = `Internal Document Context:
<document_context>
${retrievedContext || "No specific context was retrieved from internal documents for this query."}
</document_context>

User's Question:
<user_question>
${userMessage}
</user_question>

Please formulate your response based on the guidelines provided in your system instructions.`;
        console.log(`Chat API (Claude): Sending to Claude in wellness mode. Context retrieved: ${!!retrievedContext && retrievedContext !== 'Error retrieving context. Answering from general knowledge.'}`);
      }

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

    } else if (provider === 'openai') {
      const openai = new OpenAI({ apiKey });

      // NOTE: The RAG context and complex prompting is not yet implemented for OpenAI.
      // This is a simplified path for now.
      if (chatMode === 'wellness') {
        systemPrompt = `You are a wellness assistant. The user has provided the following context from internal documents: \n\n${retrievedContext}\n\n Answer the user's question based on this context.`;
        userPromptContent = userMessage;
      } else {
        systemPrompt = "You are lucient, a helpful AI assistant.";
        userPromptContent = userMessage;
      }

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
    } else {
      return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
    }
  } catch (llmError: unknown) {
    console.error(`Chat API: Error with ${provider} API:`, llmError);
    return NextResponse.json({ error: `Failed to get response from ${provider} API.` }, { status: 500 });
  }
} 