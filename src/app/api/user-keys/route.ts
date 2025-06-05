import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr'; // Changed import
import { cookies } from 'next/headers';
import { encrypt } from '@/lib/encryption'; // Your encryption utility

export async function POST(request: NextRequest) {
  const cookieStore = await cookies(); // Await cookies

  // Initialize Supabase client using @supabase/ssr
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // For API Routes, we need to be able to set cookies
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          // For API Routes, we need to be able to remove cookies
          cookieStore.set({ name, value: '', ...options }); // Or cookieStore.delete for newer next versions if applicable
        }
      }
    }
  );

  // 1. Get the current user (more secure than getSession for this operation)
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.error('Error getting user:', userError.message);
    return NextResponse.json({ error: 'Failed to get user session.', details: userError.message }, { status: 500 });
  }

  if (!user) {
    console.log('[API /api/user-keys] No user found (getUser).');
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  const userId = user.id;

  // 2. Parse the request body
  let provider: string;
  let apiKey: string;
  let label: string | undefined;

  try {
    const body = await request.json();
    provider = body.provider;
    apiKey = body.apiKey;
    label = body.label;

    if (!provider || typeof provider !== 'string') {
      return NextResponse.json({ error: 'Provider is required and must be a string.' }, { status: 400 });
    }
    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json({ error: 'API Key is required and must be a string.' }, { status: 400 });
    }
    if (label && typeof label !== 'string') {
      return NextResponse.json({ error: 'Label must be a string if provided.' }, { status: 400 });
    }

  } catch (_) { // eslint-disable-line @typescript-eslint/no-unused-vars
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    // 3. Encrypt the API key
    const { encryptedText, iv, authTag } = encrypt(apiKey);

    // 4. Save/Update the key in the database
    const { data, error: dbError } = await supabase
      .from('user_llm_api_keys')
      .upsert({
        user_id: userId,
        provider: provider,
        encrypted_api_key: encryptedText,
        iv: iv,
        auth_tag: authTag,
        label: label,
      }, {
        onConflict: 'user_id,provider',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Supabase DB Error:', dbError.message);
      return NextResponse.json({ error: 'Failed to save API key to database.', details: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'API Key saved successfully.', data }, { status: 200 });

  } catch (encryptionError: unknown) {
    let errorMessage = 'An unexpected error occurred while saving the API key.';
    let errorDetails = 'Unknown error during encryption/save process.';

    if (encryptionError instanceof Error) {
      errorDetails = encryptionError.message;
      console.error('Encryption/Save Error:', errorDetails);
      if (errorDetails.includes('USER_API_KEY_ENCRYPTION_SECRET') || errorDetails.includes('Encryption input must be')) {
        // Keep original more specific message for this known server config issue
        errorMessage = 'Server configuration error during encryption.'; 
      }
    } else {
      console.error('Encryption/Save Error (non-standard error object):', encryptionError);
    }
    return NextResponse.json({ error: errorMessage, details: errorDetails }, { status: 500 });
  }
} 