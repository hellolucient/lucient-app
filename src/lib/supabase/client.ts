// Placeholder for Supabase client initialization

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let supabaseSingleton: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseSingleton) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // console.log("Supabase Client Init - Anon Key:", supabaseAnonKey);

    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set in environment variables.');
    }
    if (!supabaseAnonKey) {
      throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in environment variables.');
    }

    // Use createBrowserClient for client-side components
    supabaseSingleton = createBrowserClient(supabaseUrl, supabaseAnonKey);
    console.log('Supabase browser client initialized.');
  }
  return supabaseSingleton;
}

// Remove the old getSupabaseAdminClient or ensure it also uses appropriate ssr client if kept
// For server-side operations outside of middleware (e.g., Route Handlers, Server Actions),
// you would typically create a new client instance per request using createServerClient
// or a similar pattern that can handle cookies for that specific request context.

export default getSupabaseClient; 