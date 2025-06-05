import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { decrypt } from '@/lib/encryption';
import OpenAI from 'openai';
import { queryTopK } from '@/lib/vector/queryTopK';

// Define a more specific type for the Qdrant payload
interface QdrantChatPayload {
  originalText?: string;
  fileName?: string;
  original_filename?: string;
  source?: string;
  page_number?: number;
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

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('OpenAI Chat API: Error getting user:', userError?.message);
    return NextResponse.json({ error: 'Authentication failed.', details: userError?.message }, { status: 500 });
  }

  let userMessage: string;
  let requestedModel: string | undefined;

  try {
    const body = await request.json();
    userMessage = body.message;
    requestedModel = body.model;

    if (!userMessage || typeof userMessage !== 'string') {
      return NextResponse.json({ error: 'Message is required and must be a string.' }, { status: 400 });
    }
    if (requestedModel && typeof requestedModel !== 'string') {
      return NextResponse.json({ error: 'Model must be a string if provided.' }, { status: 400 });
    }
  } catch (_) { // eslint-disable-line @typescript-eslint/no-unused-vars
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  let retrievedContext = '';
  try {
    console.log(`OpenAI Chat API: Retrieving context for user message: "${userMessage.substring(0, 100)}..."`);
    const contextResults = await queryTopK(userMessage, TOP_K_RESULTS, QDRANT_COLLECTION_NAME);
    
    if (contextResults && contextResults.length > 0) {
      const processedContextChunks = contextResults
        .map(result => {
          const payload = result.payload as QdrantChatPayload | null;

          if (!payload || !payload.originalText) {
            console.log(`OpenAI Chat API: Skipping Qdrant result ID ${result.id} (score: ${result.score.toFixed(4)}) due to missing payload or originalText content.`);
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
        console.log(`OpenAI Chat API: Processed ${processedContextChunks.length} context snippets (from ${contextResults.length} raw Qdrant results) to be used for RAG.`);
      } else {
        console.log(`OpenAI Chat API: ${contextResults.length} raw results from Qdrant, but none contained usable text content after processing.`);
        retrievedContext = '';
      }
    } else {
      console.log('OpenAI Chat API: No results returned from Qdrant (queryTopK) for the user message.');
    }
  } catch (ragError: unknown) {
    let errorMessage = 'Unknown error during RAG context retrieval';
    if (ragError instanceof Error) {
      errorMessage = ragError.message;
      console.error('OpenAI Chat API: Error during RAG context retrieval:', errorMessage);
    } else {
      console.error('OpenAI Chat API: Non-error thrown during RAG context retrieval:', ragError);
    }
    retrievedContext = 'Error retrieving context. Answering from general knowledge.';
  }

  let apiKey: string;
  try {
    const { data: apiKeyData, error: dbError } = await supabase
      .from('user_llm_api_keys')
      .select('encrypted_api_key, iv, auth_tag')
      .eq('user_id', user.id)
      .eq('provider', 'openai')
      .single();

    if (dbError) {
      console.error('OpenAI Chat API: DB error fetching API key:', dbError.message);
      return NextResponse.json({ error: 'Failed to retrieve OpenAI API key.', details: dbError.message }, { status: 500 });
    }
    if (!apiKeyData) {
      return NextResponse.json({ error: 'OpenAI API key not found for this user.' }, { status: 404 });
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
      console.error('OpenAI Chat API: Decryption failed:', errorDetails);
    } else {
      console.error('OpenAI Chat API: Non-error thrown during decryption:', decryptionError);
    }
    return NextResponse.json({ error: 'Failed to decrypt OpenAI API key.', details: errorDetails }, { status: 500 });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const modelToUse = requestedModel || "gpt-3.5-turbo";

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

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPromptContent,
      },
    ];
    
    console.log(`OpenAI Chat API: Sending to model ${modelToUse}. Context retrieved: ${!!retrievedContext && retrievedContext !== 'Error retrieving context. Answering from general knowledge.'}`);

    const chatCompletion = await openai.chat.completions.create({
      model: modelToUse,
      messages: messages,
      max_tokens: 3072,
    });

    const responseText = chatCompletion.choices[0]?.message?.content?.trim() || '';

    return NextResponse.json({ reply: responseText, fullResponse: chatCompletion }, { status: 200 });

  } catch (error) {
    let errorMessage = "An unexpected error occurred.";
    let errorCode = 500;

    // Check if the error is an APIError from the OpenAI SDK
    if (error instanceof OpenAI.APIError) {
      errorMessage = error.message || "Error calling OpenAI API";
      errorCode = error.status || 500;
      console.error("OpenAI APIError:", error.name, error.headers, error.error);
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      // Fallback for non-Error objects
      errorMessage = String(error);
    }
    console.error("Error in OpenAI chat API:", error);
    return NextResponse.json({ error: errorMessage }, { status: errorCode });
  }
}

async function streamToString(stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>) {
  let result = "";
  for await (const part of stream) {
    result += part.choices[0]?.delta?.content || "";
  }
  return result;
} 