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
  } catch (_) { // eslint-disable-line @typescript-eslint/no-unused-vars
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

  } catch (decryptionError: unknown) {
    let errorDetails = 'Unknown decryption error';
    if (decryptionError instanceof Error) {
      errorDetails = decryptionError.message;
      console.error('Image API: Decryption failed:', errorDetails);
    } else {
      console.error('Image API: Non-error thrown during decryption:', decryptionError);
    }
    return NextResponse.json({ error: 'Failed to decrypt OpenAI API key.', details: errorDetails }, { status: 500 });
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

  } catch (openaiError: unknown) {
    console.error('Image API: OpenAI API error object:', openaiError);

    let errorMessage = 'Failed to generate image using OpenAI API.';
    let errorStatus = 500;
    let errorDetails: string | undefined = undefined;

    if (openaiError instanceof OpenAI.APIError) {
      errorMessage = openaiError.message || errorMessage;
      errorStatus = openaiError.status || errorStatus;
      
      // Extract details from openaiError.error (which could be an object with code, message, etc.)
      // or from openaiError.response.data.error for some HTTP errors
      let nestedError: { message?: string; code?: string } | undefined = undefined;
      if (openaiError.error && typeof openaiError.error === 'object') {
        nestedError = openaiError.error as { message?: string; code?: string };
        errorDetails = nestedError.message;
      } else {
        // Fallback: Check for a more deeply nested structure.
        const errorAsObject = openaiError as unknown as Record<string, unknown>; // Cast to unknown first
        if (typeof errorAsObject.response === 'object' && errorAsObject.response !== null) {
          const response = errorAsObject.response as Record<string, unknown>; 
          if (typeof response.data === 'object' && response.data !== null) {
            const data = response.data as Record<string, unknown>;
            if (typeof data.error === 'object' && data.error !== null) {
              // Assuming data.error has message and code, if they exist
              nestedError = data.error as { message?: string; code?: string }; 
              errorDetails = nestedError?.message;
            }
          }
        }
      }
      
      if (errorStatus === 401) {
        errorMessage = 'OpenAI API authentication failed. Please check your API key.';
      } else if (errorStatus === 429) {
        errorMessage = 'OpenAI API rate limit exceeded or quota reached. Please check your OpenAI plan and billing details.';
      } else if (errorStatus === 400 && nestedError?.code === 'content_policy_violation') {
        errorMessage = `Your prompt was rejected by OpenAI\'s content policy. Please modify your prompt.`;
        errorDetails = nestedError?.message || 'Content policy violation'; // Ensure details has a value
      }
      // Safely try to get the most relevant error object to log
      let errorToLog: unknown = openaiError.error; // Default to APIError.error
      if (!errorToLog && typeof openaiError === 'object' && openaiError !== null) {
        const errorAsObjectForLog = openaiError as unknown as Record<string, unknown>; // Cast to unknown first
        if (typeof errorAsObjectForLog.response === 'object' && errorAsObjectForLog.response !== null) {
            const responseForLog = errorAsObjectForLog.response as Record<string, unknown>; 
            if (typeof responseForLog.data === 'object' && responseForLog.data !== null && 'error' in responseForLog.data) {
                errorToLog = (responseForLog.data as {error: unknown}).error;
            }
        }
      }
      console.error(`Image API: OpenAI APIError (Status ${errorStatus}): ${errorMessage}`, errorToLog);
    } else if (openaiError instanceof Error) {
      errorMessage = openaiError.message;
      console.error('Image API: Generic Error from OpenAI Image call:', errorMessage);
    } else {
      console.error('Image API: Non-standard error thrown from OpenAI Image call:', openaiError);
    }
    
    return NextResponse.json({ error: errorMessage, details: errorDetails || errorMessage }, { status: errorStatus });
  }
} 