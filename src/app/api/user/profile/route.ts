import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_tier, message_credits, email, first_name, last_name')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError.message);
      return NextResponse.json({ profile: null, error: 'Profile not found.' }, { status: 404 });
    }
    
    return NextResponse.json({ profile });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown server error occurred';
    console.error("Profile API Error:", message);
    return NextResponse.json({ error: "Internal Server Error", details: message }, { status: 500 });
  }
} 