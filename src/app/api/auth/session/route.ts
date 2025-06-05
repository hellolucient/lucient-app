import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // Set and remove are not strictly necessary for just checking a session,
        // but including them for completeness if the client ever tried to use them.
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Error getting session in /api/auth/session:', error.message);
    return NextResponse.json({ sessionExists: false, error: 'Failed to check session' }, { status: 500 });
  }

  if (session) {
    return NextResponse.json({ sessionExists: true, userId: session.user.id });
  } else {
    return NextResponse.json({ sessionExists: false });
  }
} 