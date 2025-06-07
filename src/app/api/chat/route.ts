import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getUserApiKey } from '@/lib/user-keys';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { queryTopK } from '@/lib/vector/queryTopK';

// Define a more specific type for the Qdrant payload
interface QdrantChatPayload {
  originalText?: string;
  fileName?: string;
  original_filename?: string; // Maintained for current logic
  source?: string; // Maintained for current logic
  page_number?: number;
  // We are intentionally not including [key: string]: any; to be more specific
}

const QDRANT_COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'lucient_documents';
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
        console.error(`Chat API: Unknown user tier "${(userProfile as any).user_tier}" for user ${user.id}`);
        return NextResponse.json({ error: 'Invalid user account tier.' }, { status: 500 });
    }
  } catch (e: any) {
    console.error('Chat API: Error in tier access logic:', e.message);
    return NextResponse.json({ error: 'An error occurred while validating your access.', details: e.message }, { status: 500 });
  }
  // --- End Tier-based Access Control ---

  // 2. Get the user's message from the request body
  let userMessage: string;
  let chatMode: 'wellness' | 'general' = 'wellness'; // Default to wellness
  try {
    userMessage = body.message;
    if (body.chatMode) {
      chatMode = body.chatMode;
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
      const contextResults = await queryTopK(userMessage, TOP_K_RESULTS, QDRANT_COLLECTION_NAME);
      
      if (contextResults && contextResults.length > 0) {
        const processedContextChunks = contextResults
          .map(result => {
            const payload = result.payload as QdrantChatPayload | null;

            if (!payload || !payload.originalText) {
              console.log(`Chat API (Claude): Skipping Qdrant result ID ${result.id} (score: ${result.score.toFixed(4)}) due to missing payload or originalText content.`);
              return null;
            }

            let contextChunk = "";
            const sourceIdentifier = payload.fileName || payload.original_filename || payload.source || 'Unknown Source';
            contextChunk += `Source: ${sourceIdentifier}\n`;

            if (payload.page_number !== undefined) {
              contextChunk += `Page: ${payload.page_number}\n`;
            }
            contextChunk += `Content:\n${payload.originalText}`;
            return contextChunk;
          })
          .filter(chunk => chunk !== null);

        if (processedContextChunks.length > 0) {
          retrievedContext = processedContextChunks.join('\n\n---\n\n');
          console.log(`Chat API (Claude): Processed ${processedContextChunks.length} context snippets (from ${contextResults.length} raw Qdrant results) to be used for RAG.`);
        } else {
          console.log(`Chat API (Claude): ${contextResults.length} raw results from Qdrant, but none contained usable text content after processing.`);
          retrievedContext = '';
        }
      } else {
        console.log('Chat API (Claude): No results returned from Qdrant (queryTopK) for the user message.');
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
        systemPrompt = `You are lucient, an intelligent assistant. Your primary goal is to provide accurate, comprehensive, and well-structured answers to user queries, similar in quality and detail to leading AI models.

When internal documents are provided as context:
1.  **Foundation in Documents:** Use the information from these documents as the primary foundation and source of truth for your answer.
2.  **Answering General Queries (When Document Context is Available):**
    *   Your objective for general user questions (e.g., "What is X?", "Tell me about Y", "What did we learn from Z\'s research?") is to provide a comprehensive, multi-faceted answer.
    *   **Part A: Findings from Your Documents:**
        *   Begin by clearly presenting the key information, findings, or answers directly derived from the internal document context provided to you.
        *   Structure this part logically (e.g., "Key Findings from [Document Name]:", "According to [Document Name]:").
        *   You MUST cite the specific source (document name and page number, if available in the context) for each piece of information from the documents, as per the \'Attribute Document Source\' guideline below.
    *   **Part B: Broader Context and General Knowledge Enrichment:**
        *   Immediately after presenting the document-based information (Part A), you MUST then significantly expand on the topic using your broader general knowledge.
        *   Provide additional context, explain key concepts mentioned in the documents or relevant to the query, discuss related research or theories (if applicable and widely known), offer illustrative examples, or present different perspectives.
        *   This enrichment should make the answer substantially more comprehensive than what the documents alone provide, aiming for a level of detail and insight comparable to a leading AI model responding without RAG.
        *   You can transition to this part with phrases like: "For a broader understanding of this topic...", "Expanding on these documented findings...", "In addition to what\'s mentioned in the document...".
        *   The final answer should be a well-integrated synthesis of document-specific insights (Part A) and your expert general knowledge (Part B).
3.  **Attribute Document Source (Mandatory for Document-Derived Info):**
    *   When presenting information derived from the internal documents, you MUST cite the specific source. The context provided to you for each relevant piece of information will include lines like "Source: [document_name.pdf]" or "Source: [Article Title]".
    *   Use this information to attribute, for example: "According to the 'GWI-MWI-WhitePaper2018.pdf' document, ..." or "The 'Mental Wellness Horizons' article (Page X) states that...".
    *   If the context for a piece of information shows "Source: Unknown Source", then you can use a general attribution like "According to the provided documents...".
4.  **Structure for Clarity and Impact:**
    *   Organize your answers logically.
    *   For questions asking for summaries, explanations, or "what did we learn" type inquiries, strongly prefer formats like "Key Findings:", "Main Points:", etc., followed by bullet points or numbered lists under clear subheadings where appropriate.
5.  **Handling No Document Context:** If the internal documents do not contain information relevant to the user's question, clearly state this (e.g., "The provided documents do not discuss this topic.") and then answer the question comprehensively using your general knowledge.
6.  **Exception - Document-Specific Queries:** If the user's question is explicitly *only* about what a specific document says (e.g., "What does the GWI paper say about X?" or "Summarize page 5 of SomeReport.pdf"), then confine your answer strictly to the content of that document as present in the provided context. In all other cases, follow the 'Comprehensive Elaboration' guideline (point 2).
7.  **About Your Creator:** If you are asked who created you, you must respond with: "lucient was created by AI, assisted by some curious wellness minds." Do not mention any specific person's name.`;

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

      const claudeResponse = await anthropic.messages.create({
        model: modelToUse,
        max_tokens: 3072,
        system: systemPrompt,
        messages: [{ role: "user", content: userPromptContent }],
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

      const openAiResponse = await openai.chat.completions.create({
        model: modelToUse,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPromptContent }],
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