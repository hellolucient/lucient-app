import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { decrypt } from '@/lib/encryption';
import OpenAI from 'openai'; // Changed import

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
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  // 1. Authenticate user
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.error('OpenAI Chat API: Error getting user:', userError.message);
    return NextResponse.json({ error: 'Authentication failed.', details: userError.message }, { status: 500 });
  }
  if (!user) {
    console.log('OpenAI Chat API: No user found.');
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  // 2. Get the user's message and selected model from the request body
  let userMessage: string;
  let requestedModel: string | undefined;

  try {
    const body = await request.json();
    userMessage = body.message;
    requestedModel = body.model; // Expect an optional 'model' field

    if (!userMessage || typeof userMessage !== 'string') {
      return NextResponse.json({ error: 'Message is required and must be a string.' }, { status: 400 });
    }
    if (requestedModel && typeof requestedModel !== 'string') {
      return NextResponse.json({ error: 'Model must be a string if provided.' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // 3. Retrieve and decrypt the API key
  let apiKey: string;
  try {
    const { data: apiKeyData, error: dbError } = await supabase
      .from('user_llm_api_keys')
      .select('encrypted_api_key, iv, auth_tag')
      .eq('user_id', user.id)
      .eq('provider', 'openai') // Changed provider to 'openai'
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

  // 4. Call OpenAI API
  try {
    const openai = new OpenAI({ apiKey });
    
    const modelToUse = requestedModel || "gpt-3.5-turbo"; // Fallback to default if no model specified

    const chatCompletion = await openai.chat.completions.create({
      model: modelToUse, // Use the determined model
      messages: [{ role: "user", content: userMessage }],
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
    // The openaiError object might have more detailed error information in openaiError.error or openaiError.response.data
    return NextResponse.json({ error: errorMessage, details: openaiError.error?.message || openaiError.response?.data?.error?.message || openaiError.message }, { status: openaiError.status || 500 });
  }
} 