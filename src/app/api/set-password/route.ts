import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { password, accessToken } = await request.json();

  if (!password || !accessToken) {
    return new NextResponse(JSON.stringify({ error: 'Password and access token are required.' }), { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Use the access token to set the session for the user
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: 'dummy-refresh-token' // Refresh token is not used but is required by the method
  });

  if (sessionError) {
    return new NextResponse(JSON.stringify({ error: 'Failed to authenticate user with token.' }), { status: 401 });
  }

  // Now that the user is authenticated, update their password
  const { error: updateError } = await supabase.auth.updateUser({
    password: password,
  });

  if (updateError) {
    return new NextResponse(JSON.stringify({ error: `Failed to update password: ${updateError.message}` }), { status: 500 });
  }

  return NextResponse.json({ message: 'Password updated successfully.' });
} 