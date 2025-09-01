import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Define a specific interface for the invite options to avoid using 'any'
interface InviteUserOptions {
  redirectTo: string;
  data: {
    first_name: string;
    last_name: string;
  };
}

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { email, firstName, lastName } = await request.json();

  if (!email || !firstName) {
    return new NextResponse(JSON.stringify({ error: 'Email and first name are required.' }), { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  try {
    // 1. Get the current user and verify they are an admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return new NextResponse(JSON.stringify({ error: 'You must be logged in to perform this action.' }), { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_tier')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.user_tier !== 'admin') {
      return new NextResponse(JSON.stringify({ error: 'You do not have permission to perform this action.' }), { status: 403 });
    }

    // 2. Create the Supabase Admin Client with the service role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Use environment variable for production URL, fallback to request URL for development
    const redirectTo = process.env.NODE_ENV === 'production' 
      ? 'https://lucient-app.vercel.app/set-password'
      : `${new URL(request.url).protocol}//${new URL(request.url).host}/set-password`;

    // 3. Invite the new user
    const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: redirectTo,
        data: {
          first_name: firstName,
          last_name: lastName || '',
        }
      } as InviteUserOptions
    );

    if (inviteError) {
      console.error('Detailed error inviting user:', JSON.stringify(inviteError, null, 2));
      // Provide more specific feedback if the user already exists
      if (inviteError.message.includes('User already registered')) {
        return new NextResponse(JSON.stringify({ error: 'A user with this email already exists.' }), { status: 409 });
      }
      return new NextResponse(JSON.stringify({ error: `Failed to invite user: ${inviteError.message}` }), { status: 500 });
    }

    // The trigger `handle_new_user` will automatically create a profile for this new user.

    return NextResponse.json({ message: 'User invited successfully!', user: data.user });

  } catch (error: unknown) {
    console.error('Unexpected error in /api/admin/approve:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return new NextResponse(JSON.stringify({ error: 'An unexpected error occurred.', details: errorMessage }), { status: 500 });
  }
} 