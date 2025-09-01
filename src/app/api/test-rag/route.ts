import { NextResponse } from 'next/server';
import { queryTopK } from '@/lib/vector/supabaseVectorClient';

export async function GET() {
  try {
    console.log('Testing RAG system...');
    
    // Test query
    const testQuery = "New Zealand wellness economy";
    
    // Test with different thresholds
    const results1 = await queryTopK(testQuery, 5, undefined, 0.78); // Current threshold
    const results2 = await queryTopK(testQuery, 5, undefined, 0.5);  // Lower threshold
    const results3 = await queryTopK(testQuery, 5, undefined, 0.3);  // Much lower threshold
    
    return NextResponse.json({
      success: true,
      query: testQuery,
      resultsWithThreshold078: {
        count: results1.length,
        results: results1.map(r => ({
          id: r.id,
          score: r.score,
          fileName: r.file_name,
          chunkText: r.chunk_text?.substring(0, 100) + '...',
        }))
      },
      resultsWithThreshold05: {
        count: results2.length,
        results: results2.map(r => ({
          id: r.id,
          score: r.score,
          fileName: r.file_name,
          chunkText: r.chunk_text?.substring(0, 100) + '...',
        }))
      },
      resultsWithThreshold03: {
        count: results3.length,
        results: results3.map(r => ({
          id: r.id,
          score: r.score,
          fileName: r.file_name,
          chunkText: r.chunk_text?.substring(0, 100) + '...',
        }))
      }
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
