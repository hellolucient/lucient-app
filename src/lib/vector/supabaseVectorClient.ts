import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../ai/embeddingUtils';

// Initialize Supabase client with service role key for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface DocumentChunk {
  id?: string;
  text: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export interface QueryResult {
  id: string;
  score: number;
  payload?: Record<string, unknown> | null;
  chunk_text?: string;
  file_name?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Upsert document chunks to Supabase vector database
 */
export async function upsertDocumentChunks(
  chunks: DocumentChunk[], 
  userId: string,
  fileName: string,
  originalText: string
): Promise<void> {
  console.log(`Upserting ${chunks.length} chunks to Supabase for user ${userId}`);

  const documentsToInsert = [];

  for (const chunk of chunks) {
    const embedding = chunk.embedding || await generateEmbedding(chunk.text);
    
    documentsToInsert.push({
      user_id: userId,
      file_name: fileName,
      original_text: originalText,
      chunk_text: chunk.text,
      embedding: embedding,
      metadata: chunk.metadata || {}
    });
  }

  if (documentsToInsert.length > 0) {
    try {
      const { error } = await supabase
        .from('documents')
        .insert(documentsToInsert);

      if (error) {
        console.error('Error upserting documents to Supabase:', error);
        throw error;
      }

      console.log(`Successfully upserted ${documentsToInsert.length} documents to Supabase.`);
    } catch (error) {
      console.error('Error upserting documents to Supabase:', error);
      throw error;
    }
  } else {
    console.log('No documents to upsert.');
  }
}

/**
 * Query top K similar documents from Supabase vector database
 */
export async function queryTopK(
  queryText: string, 
  topK: number = 5, 
  userId?: string,
  matchThreshold: number = 0.78
): Promise<QueryResult[]> {
  console.log(`Querying Supabase with topK=${topK}, threshold=${matchThreshold}`);

  try {
    const queryEmbedding = await generateEmbedding(queryText);

    // Use the match_documents function we created in the migration
    const { data, error } = await supabase
      .rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: topK,
        user_filter: userId || null
      });

    if (error) {
      console.error('Error querying Supabase:', error);
      throw error;
    }

    console.log(`Found ${data?.length || 0} results from Supabase.`);

    // Map to QueryResult structure for compatibility
    return (data || []).map((result: Record<string, unknown>) => ({
      id: result.id,
      score: result.similarity,
      payload: {
        text: result.chunk_text,
        file_name: result.file_name,
        metadata: result.metadata
      },
      chunk_text: result.chunk_text,
      file_name: result.file_name,
      metadata: result.metadata
    }));

  } catch (error) {
    console.error('Error querying Supabase:', error);
    throw error;
  }
}

/**
 * Delete all documents for a specific user
 */
export async function deleteUserDocuments(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting user documents:', error);
      throw error;
    }

    console.log(`Successfully deleted all documents for user ${userId}`);
  } catch (error) {
    console.error('Error deleting user documents:', error);
    throw error;
  }
}

/**
 * Get document statistics for a user
 */
export async function getUserDocumentStats(userId: string): Promise<{
  totalDocuments: number;
  totalChunks: number;
  uniqueFiles: number;
}> {
  try {
    // Get total chunks
    const { count: totalChunks, error: chunksError } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (chunksError) throw chunksError;

    // Get unique files
    const { data: files, error: filesError } = await supabase
      .from('documents')
      .select('file_name')
      .eq('user_id', userId);

    if (filesError) throw filesError;

    const uniqueFiles = new Set(files?.map(f => f.file_name) || []).size;

    return {
      totalDocuments: uniqueFiles,
      totalChunks: totalChunks || 0,
      uniqueFiles
    };

  } catch (error) {
    console.error('Error getting user document stats:', error);
    throw error;
  }
}
