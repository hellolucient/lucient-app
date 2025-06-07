import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )

  try {
    // 1. Get the current user from the session
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('Error fetching user:', userError);
      return new NextResponse(JSON.stringify({ error: 'You must be logged in to access this.' }), { status: 401 });
    }

    // 2. Check if the user is an admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_tier')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('Error fetching profile:', profileError);
      return new NextResponse(JSON.stringify({ error: 'Could not find user profile.' }), { status: 404 });
    }

    if (profile.user_tier !== 'admin') {
      return new NextResponse(JSON.stringify({ error: 'You do not have permission to perform this action.' }), { status: 403 });
    }

    // 3. If user is an admin, fetch all invite requests
    const { data: invites, error: invitesError } = await supabase
      .from('invite_requests')
      .select('*')
      // Optional: you might want to order them
      .order('created_at', { ascending: false });

    if (invitesError) {
        console.error('Error fetching invites:', invitesError);
        return new NextResponse(JSON.stringify({ error: 'Failed to fetch invite requests.' }), { status: 500 });
    }

    return NextResponse.json(invites);

  } catch (error) {
    console.error('Unexpected error in /api/admin/invites:', error);
    return new NextResponse(JSON.stringify({ error: 'An unexpected error occurred.' }), { status: 500 });
  }
} 