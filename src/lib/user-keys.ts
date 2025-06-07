import { decrypt } from '@/lib/encryption';
import { type SupabaseClient } from '@supabase/supabase-js';

// This function can be called from server-side components and API routes
export async function getUserApiKey(userId: string, provider: string, supabase: SupabaseClient) {
  try {
    const { data: keyData, error } = await supabase
      .from('user_llm_api_keys')
      .select('encrypted_api_key, iv, auth_tag')
      .eq('user_id', userId)
      .eq('provider', provider)
      .single();

    if (error || !keyData) {
      if (error && error.code !== 'PGRST116') { // Don't log "not found" as an error
        console.error('Error fetching API key:', error.message);
      }
      return null;
    }

    const decryptedKey = decrypt({
      encryptedText: keyData.encrypted_api_key,
      iv: keyData.iv,
      authTag: keyData.auth_tag,
    });

    return decryptedKey;

  } catch (e) {
    console.error('Error in getUserApiKey:', e);
    return null; // Return null on failure
  }
} 