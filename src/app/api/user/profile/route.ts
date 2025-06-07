import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
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

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('user_tier, message_credits, email, first_name, last_name') // Select the new columns
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error.message);
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    return NextResponse.json({ profile });

  } catch (e: any) {
    console.error('Error in /api/user/profile:', e.message);
    return NextResponse.json({ error: 'Failed to retrieve user profile.' }, { status: 500 });
  }
} 