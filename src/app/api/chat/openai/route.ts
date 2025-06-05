import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { decrypt } from '@/lib/encryption';
import OpenAI from 'openai';
import { queryTopK } from '@/lib/vector/queryTopK';

const QDRANT_COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'lucient_documents';
const TOP_K_RESULTS = 3;

export async function POST(request: NextRequest) {
  const cookieStore = cookies(); 

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
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  let retrievedContext = '';
  try {
    console.log(`OpenAI Chat API: Retrieving context for user message: "${userMessage.substring(0, 50)}..."`);
    const contextResults = await queryTopK(userMessage, TOP_K_RESULTS, QDRANT_COLLECTION_NAME);
    
    if (contextResults && contextResults.length > 0) {
      retrievedContext = contextResults
        .map(result => result.payload?.originalText as string)
        .filter(text => text)
        .join('\n\n---\n\n');
      console.log(`OpenAI Chat API: Retrieved ${contextResults.length} context snippets.`);
    } else {
      console.log('OpenAI Chat API: No context found or an issue with retrieval.');
    }
  } catch (ragError: any) {
    console.error('OpenAI Chat API: Error retrieving context from Qdrant:', ragError.message);
    retrievedContext = 'No context retrieved due to an error.'; 
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

  } catch (decryptionError: any) {
    console.error('OpenAI Chat API: Decryption failed:', decryptionError.message);
    return NextResponse.json({ error: 'Failed to decrypt OpenAI API key.', details: decryptionError.message }, { status: 500 });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const modelToUse = requestedModel || "gpt-3.5-turbo";

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are a helpful assistant. Use the following context to answer the user's question. If the context is not relevant or doesn't contain the answer, answer the question to the best of your ability without explicitly mentioning the context was insufficient.\n\nContext:\n${retrievedContext}`
      },
      {
        role: "user",
        content: userMessage
      }
    ];
    
    console.log(`OpenAI Chat API: Sending to model ${modelToUse}. Original message: "${userMessage.substring(0,50)}...", Context retrieved: ${!!retrievedContext && retrievedContext !== 'No context retrieved due to an error.'}`);

    const chatCompletion = await openai.chat.completions.create({
      model: modelToUse,
      messages: messages,
      max_tokens: 2048,
    });

    const responseText = chatCompletion.choices[0]?.message?.content?.trim() || '';

    return NextResponse.json({ reply: responseText, fullResponse: chatCompletion }, { status: 200 });

  } catch (openaiError: any) {
    console.error('OpenAI Chat API: OpenAI API error:', openaiError);
    let errorMessage = 'Failed to get response from OpenAI API.';
    if (openaiError.status === 401) {
        errorMessage = 'OpenAI API authentication failed. Please check your API key.';
    } else if (openaiError.status === 429) {
        errorMessage = 'OpenAI API rate limit exceeded or quota reached. Please check your OpenAI plan and billing details.';
    } else if (openaiError.message) {
        errorMessage = openaiError.message;
    }
    return NextResponse.json({ error: errorMessage, details: openaiError.error?.message || openaiError.response?.data?.error?.message || openaiError.message }, { status: openaiError.status || 500 });
  }
} 