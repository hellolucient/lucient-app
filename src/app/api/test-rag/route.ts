import { NextResponse } from 'next/server';
import { queryTopK } from '@/lib/vector/supabaseVectorClient';

export async function GET() {
  try {
    console.log('Testing RAG system...');
    
    // Test query
    const testQuery = "New Zealand wellness economy";
    const results = await queryTopK(testQuery, 5);
    
    return NextResponse.json({
      success: true,
      query: testQuery,
      resultsCount: results.length,
      results: results.map(r => ({
        id: r.id,
        score: r.score,
        fileName: r.file_name,
        chunkText: r.chunk_text?.substring(0, 100) + '...',
        metadata: r.metadata
      }))
    });
    
  } catch (error) {
    console.error('RAG test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
