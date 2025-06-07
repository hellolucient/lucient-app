// Placeholder for Supabase auth helpers, user/admin role checks

import { getSupabaseClient } from './client';
import type { User, AuthError, Session } from '@supabase/supabase-js';

// Define a more specific type for auth function responses
interface AuthActionResponse {
  data: {
    user: User | null;
    session?: Session | null; // session is present in signIn, can be in signUp
  };
  error: AuthError | null;
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error('Error getting current user:', error.message);
    return null;
  }
  return data.user;
}

export async function isUserAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) {
    return false;
  }

  // This is a placeholder for role checking logic.
  // You might store roles in user_metadata, a separate 'profiles' table, or use custom claims.
  // Example: Check for a custom claim (requires Supabase Function or trigger to set claims)
  // const { data: { session } } = await getSupabaseClient().auth.getSession();
  // const claims = session?.user?.user_metadata?.claims;
  // return claims?.includes('admin') || false;

  // Example: Check a 'role' field in a 'profiles' table
  /*
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error("Error fetching user role:", error);
    return false;
  }
  return data?.role === 'admin';
  */

  // For now, a simple placeholder. Replace with your actual logic.
  console.warn("isUserAdmin: Role checking is not fully implemented. Returning false by default.");
  // To test, you could temporarily return true or check a specific user ID:
  // return user.email === "admin@example.com"; 
  return false;
}

// Add other auth related functions: signIn, signOut, passwordReset, etc.

export async function signInWithEmail(email: string, password: string): Promise<AuthActionResponse> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });
  if (error) {
    console.error("Error signing in:", error.message);
    throw error;
  }
  console.log("Sign in successful:", data.user);
  return { data, error };
}

// Example signOut function:
export async function signOut() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error signing out:', error.message);
    throw error;
  }
  console.log('User signed out successfully.');
  // Typically, you would redirect the user or update UI state after sign out.
} 