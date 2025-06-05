import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { decrypt } from '@/lib/encryption';
import Anthropic from '@anthropic-ai/sdk';
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

  // 2. Get the user's message from the request body
  let userMessage: string;
  try {
    const body = await request.json();
    userMessage = body.message;
    if (!userMessage || typeof userMessage !== 'string') {
      return NextResponse.json({ error: 'Message is required and must be a string.' }, { status: 400 });
    }
  } catch (_) { // eslint-disable-line @typescript-eslint/no-unused-vars
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // --- RAG Implementation Start ---
  let retrievedContext = '';
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
  // --- RAG Implementation End ---

  // 3. Retrieve and decrypt the API key
  let apiKey: string;
  try {
    const { data: apiKeyData, error: dbError } = await supabase
      .from('user_llm_api_keys')
      .select('encrypted_api_key, iv, auth_tag')
      .eq('user_id', user.id)
      .eq('provider', 'anthropic')
      .single();

    if (dbError) {
      console.error('Chat API: DB error fetching API key:', dbError.message);
      return NextResponse.json({ error: 'Failed to retrieve API key.', details: dbError.message }, { status: 500 });
    }
    if (!apiKeyData) {
      return NextResponse.json({ error: 'Anthropic API key not found for this user.' }, { status: 404 });
    }

    apiKey = decrypt({
      encryptedText: apiKeyData.encrypted_api_key,
      iv: apiKeyData.iv,
      authTag: apiKeyData.auth_tag,
    });

  } catch (decryptionError: unknown) {
    let errorDetails = 'Unknown decryption error';
    if (decryptionError instanceof Error) {
      errorDetails = decryptionError.message;
      console.error('Chat API: Decryption failed:', errorDetails);
    } else {
      console.error('Chat API: Non-error thrown during decryption:', decryptionError);
    }
    return NextResponse.json({ error: 'Failed to decrypt API key.', details: errorDetails }, { status: 500 });
  }

  // 4. Call Claude API
  try {
    const anthropic = new Anthropic({
      apiKey,
    });

    const systemPrompt = `You are Lucient, an intelligent assistant. Your primary goal is to provide accurate, comprehensive, and well-structured answers to user queries, similar in quality and detail to leading AI models.

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
6.  **Exception - Document-Specific Queries:** If the user's question is explicitly *only* about what a specific document says (e.g., "What does the GWI paper say about X?" or "Summarize page 5 of SomeReport.pdf"), then confine your answer strictly to the content of that document as present in the provided context. In all other cases, follow the 'Comprehensive Elaboration' guideline (point 2).`;

    const userPromptContent = `Internal Document Context:
<document_context>
${retrievedContext || "No specific context was retrieved from internal documents for this query."}
</document_context>

User's Question:
<user_question>
${userMessage}
</user_question>

Please formulate your response based on the guidelines provided in your system instructions.`;

    console.log(`Chat API (Claude): Sending to Claude. Context retrieved: ${!!retrievedContext && retrievedContext !== 'Error retrieving context. Answering from general knowledge.'}`);
    
    const claudeResponse = await anthropic.messages.create({
      model: "claude-3-opus-20240229", // Consider claude-3.5-sonnet for speed/cost if Opus is too much
      max_tokens: 3072, // Increased max_tokens for more comprehensive answers
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPromptContent,
        },
      ],
    });

    let responseText = '';
    if (claudeResponse.content && claudeResponse.content.length > 0) {
        const firstTextBlock = claudeResponse.content.find(block => block.type === 'text') as Anthropic.TextBlock | undefined;
        if (firstTextBlock) {
            responseText = firstTextBlock.text;
        }
    }
    
    if (!responseText && claudeResponse.stop_reason) {
        console.log(`Chat API: Claude response ended with reason: ${claudeResponse.stop_reason}`);
    }

    return NextResponse.json({ reply: responseText, fullResponse: claudeResponse }, { status: 200 });

  } catch (claudeError: unknown) {
    console.error('Chat API: Claude API error object:', claudeError); // Log the raw error object for inspection

    let errorMessage = 'Failed to get response from Claude API.';
    let errorStatus = 500;
    let errorDetails: string | undefined = undefined;

    if (claudeError instanceof Anthropic.APIError) {
      errorMessage = claudeError.message || errorMessage;
      errorStatus = claudeError.status || errorStatus;
      if (claudeError.error && typeof claudeError.error === 'object' && 'message' in claudeError.error) {
        errorDetails = (claudeError.error as { message?: string }).message;
      }
      if (errorStatus === 401) {
        errorMessage = 'Claude API authentication failed. Please check your API key.';
      }
      console.error(`Chat API: Anthropic APIError (Status ${errorStatus}): ${errorMessage}`, claudeError.error);
    } else if (claudeError instanceof Error) {
      errorMessage = claudeError.message;
      console.error('Chat API: Generic Error from Claude call:', errorMessage);
    } else {
      console.error('Chat API: Non-standard error thrown from Claude call:', claudeError);
    }

    return NextResponse.json({ error: errorMessage, details: errorDetails || errorMessage }, { status: errorStatus });
  }
} 