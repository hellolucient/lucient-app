import { NextResponse } from 'next/server';
import { queryTopK } from '@/lib/vector/supabaseVectorClient';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, conversationHistory } = body;
    
    console.log('Debug Chat - Message:', message);
    console.log('Debug Chat - Conversation History:', conversationHistory);
    
    // Test RAG query
    const ragResults = await queryTopK(message, 5, undefined, 0.5);
    
    return NextResponse.json({
      success: true,
      message: message,
      conversationHistory: conversationHistory,
      ragResults: {
        count: ragResults.length,
        results: ragResults.map(r => ({
          id: r.id,
          score: r.score,
          fileName: r.file_name,
          chunkText: r.chunk_text?.substring(0, 200) + '...',
        }))
      }
    });
    
  } catch (error) {
    console.error('Debug chat error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
