import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { decrypt } from '@/lib/encryption';
import Anthropic from '@anthropic-ai/sdk';
import { queryTopK } from '@/lib/vector/queryTopK';
import { generateEmbedding } from '@/lib/ai/embeddingUtils';

const QDRANT_COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'lucient_documents';
const TOP_K_RESULTS = 3;

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
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // --- RAG Implementation Start ---
  let retrievedContext = '';
  try {
    console.log(`Chat API: Retrieving context for user message: "${userMessage.substring(0, 50)}..."`);
    const contextResults = await queryTopK(userMessage, TOP_K_RESULTS, QDRANT_COLLECTION_NAME);
    
    if (contextResults && contextResults.length > 0) {
      retrievedContext = contextResults
        .map(result => result.payload?.originalText as string)
        .filter(text => text)
        .join('\n\n---\n\n');
      console.log(`Chat API: Retrieved ${contextResults.length} context snippets.`);
    } else {
      console.log('Chat API: No context found or an issue with retrieval.');
    }
  } catch (ragError: any) {
    console.error('Chat API: Error retrieving context from Qdrant:', ragError.message);
    retrievedContext = 'No context retrieved due to an error.'; 
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

  } catch (decryptionError: any) {
    console.error('Chat API: Decryption failed:', decryptionError.message);
    return NextResponse.json({ error: 'Failed to decrypt API key.', details: decryptionError.message }, { status: 500 });
  }

  // 4. Call Claude API
  try {
    const anthropic = new Anthropic({ apiKey });

    // Construct the augmented prompt
    const augmentedUserMessage = `Based on the following context, please answer the user's question.

Context:
${retrievedContext}

---

User Question: ${userMessage}`;
    
    console.log(`Chat API: Sending to Claude. Original message: "${userMessage.substring(0,50)}...", Context retrieved: ${!!retrievedContext}`);

    const claudeResponse = await anthropic.messages.create({
      model: "claude-3-opus-20240229", 
      max_tokens: 2048,
      messages: [{ role: "user", content: augmentedUserMessage }],
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

  } catch (claudeError: any) {
    console.error('Chat API: Claude API error:', claudeError);
    let errorMessage = 'Failed to get response from Claude API.';
    if (claudeError.status === 401) {
        errorMessage = 'Claude API authentication failed. Please check your API key.';
    } else if (claudeError.message) {
        errorMessage = claudeError.message;
    }
    return NextResponse.json({ error: errorMessage, details: claudeError.error?.message || claudeError.message }, { status: claudeError.status || 500 });
  }
} 