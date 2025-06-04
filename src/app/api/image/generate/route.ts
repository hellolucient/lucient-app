import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { decrypt } from '@/lib/encryption';
import OpenAI from 'openai';

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
    console.error('Image API: Error getting user:', userError.message);
    return NextResponse.json({ error: 'Authentication failed.', details: userError.message }, { status: 500 });
  }
  if (!user) {
    console.log('Image API: No user found.');
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  // 2. Get the prompt from the request body
  let prompt: string;
  try {
    const body = await request.json();
    prompt = body.prompt;
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required and must be a string.' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // 3. Retrieve and decrypt the OpenAI API key
  let apiKey: string;
  try {
    const { data: apiKeyData, error: dbError } = await supabase
      .from('user_llm_api_keys')
      .select('encrypted_api_key, iv, auth_tag')
      .eq('user_id', user.id)
      .eq('provider', 'openai') 
      .single();

    if (dbError) {
      console.error('Image API: DB error fetching API key:', dbError.message);
      return NextResponse.json({ error: 'Failed to retrieve OpenAI API key.', details: dbError.message }, { status: 500 });
    }
    if (!apiKeyData) {
      return NextResponse.json({ error: 'OpenAI API key not found for this user. Cannot generate image.' }, { status: 404 });
    }

    apiKey = decrypt({
      encryptedText: apiKeyData.encrypted_api_key,
      iv: apiKeyData.iv,
      authTag: apiKeyData.auth_tag,
    });

  } catch (decryptionError: any) {
    console.error('Image API: Decryption failed:', decryptionError.message);
    return NextResponse.json({ error: 'Failed to decrypt OpenAI API key.', details: decryptionError.message }, { status: 500 });
  }

  // 4. Call OpenAI Image Generation API (DALL-E)
  try {
    const openai = new OpenAI({ apiKey });

    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    });

    // Refined check for image data and URL
    if (!imageResponse.data || imageResponse.data.length === 0) {
      console.error('Image API: No data array or empty data array in OpenAI response', imageResponse);
      throw new Error('No image data received from OpenAI.');
    }

    const firstImage = imageResponse.data[0];
    const imageUrl = firstImage?.url;

    if (!imageUrl) {
      console.error('Image API: No image URL found in the first image object from OpenAI', firstImage);
      throw new Error('Failed to get image URL from OpenAI image object.');
    }

    return NextResponse.json({ imageUrl: imageUrl, fullResponse: firstImage }, { status: 200 });

  } catch (openaiError: any) {
    console.error('Image API: OpenAI API error:', openaiError);
    let errorMessage = 'Failed to generate image using OpenAI API.';
    if (openaiError.status === 401) {
        errorMessage = 'OpenAI API authentication failed. Please check your API key.';
    } else if (openaiError.status === 429) {
        errorMessage = 'OpenAI API rate limit exceeded or quota reached. Please check your OpenAI plan and billing details.';
    } else if (openaiError.status === 400 && openaiError.error?.code === 'content_policy_violation') {
        errorMessage = `Your prompt was rejected by OpenAI\'s content policy. Please modify your prompt.`;
    } else if (openaiError.message) {
        errorMessage = openaiError.message;
    }
    return NextResponse.json({ error: errorMessage, details: openaiError.error?.message || openaiError.response?.data?.error?.message || openaiError.message }, { status: openaiError.status || 500 });
  }
} 