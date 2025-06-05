import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getDocumentChunks } from '@/lib/textProcessing/chunking';
import { generateEmbedding } from '@/lib/ai/embeddingUtils';
import { getQdrantClient } from '@/lib/vector/qdrantClient';
import mammoth from 'mammoth'; // For .doc, .docx
import * as pdf from 'pdf-parse/lib/pdf-parse.js'; // For .pdf
import { randomUUID } from 'crypto'; // Import randomUUID

// Define a more specific type for the document payload sent to Qdrant
interface DocumentPointPayload {
  userId: string;
  fileName: string;
  originalText: string;
  metadata: Record<string, unknown>; // langchain Document.metadata is Record<string, unknown>
  [key: string]: unknown; // Add index signature to make it compatible with Record<string, unknown>
}

// Define PointStruct locally if import is problematic
interface PointStruct {
  id: string | number;
  vector: number[];
  payload?: DocumentPointPayload; // Use the more specific type
}

const QDRANT_COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'lucient_documents';

const ALLOWED_FILE_TYPES = [
  'text/plain',
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
];

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete({ name, ...options });
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('[API/DOCS_UPSERT] Unauthorized access:', authError);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      console.log('[API/DOCS_UPSERT] No file provided in form data.');
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log(`[API/DOCS_UPSERT] Received file. Name: ${file.name}, Size: ${file.size}, Type: ${file.type}`);

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      console.log(`[API/DOCS_UPSERT] Unsupported file type: ${file.type}`);
      return NextResponse.json({ error: `Unsupported file type: ${file.type}. Supported types are .txt, .pdf, .doc, .docx` }, { status: 400 });
    }

    let fileContent = '';
    const arrayBuffer = await file.arrayBuffer();
    console.log(`[API/DOCS_UPSERT] File read into arrayBuffer. Length: ${arrayBuffer.byteLength}`);

    try {
      console.log(`[API/DOCS_UPSERT] Attempting to parse file type: ${file.type}`);
      if (file.type === 'text/plain') {
        console.log('[API/DOCS_UPSERT] Parsing as text/plain.');
        fileContent = new TextDecoder().decode(arrayBuffer);
      } else if (file.type === 'application/msword' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        console.log('[API/DOCS_UPSERT] Parsing as Word document (doc/docx). Using Buffer.');
        const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
        fileContent = result.value;
        console.log('[API/DOCS_UPSERT] Word document parsed. Extracted text length: ', fileContent.length);
      } else if (file.type === 'application/pdf') {
        console.log('[API/DOCS_UPSERT] Parsing as PDF.');
        const data = await pdf.default(Buffer.from(arrayBuffer));
        fileContent = data.text;
        console.log('[API/DOCS_UPSERT] PDF parsed. Extracted text length:', fileContent.length);
      } else {
        console.log(`[API/DOCS_UPSERT] Unknown file type encountered in parsing block: ${file.type}`);
        // This case should ideally not be reached if ALLOWED_FILE_TYPES check is correct
        return NextResponse.json({ error: `File type ${file.type} was allowed but not handled in parsing.` }, { status: 500 });
      }
    } catch (parsingError: unknown) {
      console.error(`[API/DOCS_UPSERT] Error during file parsing. File: ${file.name}, Type: ${file.type}. Error:`, parsingError);
      let detail = 'Unknown parsing error';
      if (parsingError instanceof Error) {
        detail = parsingError.message;
      } else if (typeof parsingError === 'string') {
        detail = parsingError;
      } else {
        detail = 'Non-standard error object during parsing.';
      }
      return NextResponse.json({ error: `Failed to parse file content for ${file.name}.`, details: detail }, { status: 500 });
    }

    console.log(`[API/DOCS_UPSERT] File parsing complete. Extracted text length (trimmed): ${fileContent.trim().length}`);

    if (!fileContent || fileContent.trim() === '') {
      console.log('[API/DOCS_UPSERT] Extracted content is empty or whitespace after parsing.');
      return NextResponse.json({ error: 'Extracted content is empty. Cannot process file.' }, { status: 400 });
    }

    console.log('[API/DOCS_UPSERT] Starting chunking...');
    const chunks = await getDocumentChunks(fileContent, { chunkSize: 1000, chunkOverlap: 200 });
    console.log(`[API/DOCS_UPSERT] File chunked into ${chunks.length} pieces.`);

    if (chunks.length === 0) {
        console.log('[API/DOCS_UPSERT] File content is empty after chunking or could not be chunked.');
        return NextResponse.json({ error: 'File content is empty after chunking or could not be chunked.' }, { status: 400 });
    }

    console.log('[API/DOCS_UPSERT] Starting embedding generation...');
    const embeddingPromises = chunks.map(chunk => generateEmbedding(chunk.pageContent));
    const embeddings = await Promise.all(embeddingPromises);
    console.log(`[API/DOCS_UPSERT] Generated ${embeddings.length} embeddings.`);

    if (embeddings.length !== chunks.length) {
        console.error('[API/DOCS_UPSERT] Mismatch between number of chunks and embeddings');
        return NextResponse.json({ error: 'Failed to generate embeddings for all chunks' }, { status: 500 });
    }
    
    console.log('[API/DOCS_UPSERT] Initializing Qdrant client...');
    const qdrantClient = getQdrantClient();

    const points: PointStruct[] = chunks.map((chunk, index) => ({
      id: randomUUID(), // Use randomUUID to generate a valid ID
      vector: embeddings[index],
      payload: {
        userId: user.id,
        fileName: file.name,
        originalText: chunk.pageContent,
        metadata: chunk.metadata,
      },
    }));

    console.log(`[API/DOCS_UPSERT] Upserting ${points.length} points to Qdrant collection: ${QDRANT_COLLECTION_NAME}`);
    await qdrantClient.upsert(QDRANT_COLLECTION_NAME, { points: points });
    console.log(`[API/DOCS_UPSERT] Successfully upserted ${points.length} points.`);

    return NextResponse.json(
      {
        message: 'Document processed and embedded successfully.',
        fileName: file.name,
        chunks: chunks.length,
        collection: QDRANT_COLLECTION_NAME,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('[API/DOCS_UPSERT] Critical error in POST handler. Full error object:', error);

    let errorMessage = 'An unknown server error occurred.';
    let errorDetails: string | undefined = undefined;
    let qdrantErrorData: unknown = null;
    let errorStatus = 500;

    if (typeof error === 'object' && error !== null) {
      // Check for Qdrant ResponseError like structure or other common error patterns
      // Note: @qdrant/js-client-rest can throw ResponseError which has status and response.data
      if ('status' in error && typeof (error as { status: unknown }).status === 'number') {
        errorStatus = (error as { status: number }).status;
      }

      if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
        errorMessage = (error as { message: string }).message;
      }
      
      if ('data' in error && (error as { data: unknown }).data) {
        qdrantErrorData = (error as { data: unknown }).data;
        console.error('[API/DOCS_UPSERT] Qdrant error data:', JSON.stringify(qdrantErrorData, null, 2));
        // Attempt to get more specific Qdrant error message
        if (typeof qdrantErrorData === 'object' && qdrantErrorData !== null && 'status' in qdrantErrorData) {
          // Cast qdrantErrorData to a type that might have a status property
          const qdrantErrorRecord = qdrantErrorData as Record<string, unknown>; 
          const qdStatus = qdrantErrorRecord.status; // qdStatus is now unknown
          
          // Check if qdStatus is an object and has an error property
          if (typeof qdStatus === 'object' && qdStatus !== null && 'error' in qdStatus) {
            const statusRecord = qdStatus as Record<string, unknown>; // Cast qdStatus to access its properties
            if (typeof statusRecord.error === 'string') {
              errorMessage = `Qdrant API Error: ${statusRecord.error}`;
            }
          }
        }
      } else if ('statusText' in error && typeof (error as { statusText: unknown }).statusText === 'string' && errorStatus !== 500) {
         // If we got a status from error.status, and there's a statusText, use it for more detail
         errorMessage = `Error ${errorStatus}: ${(error as { statusText: string }).statusText}`;
      }

      if (error instanceof Error && error.stack) {
        errorDetails = error.stack;
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    return NextResponse.json({
      error: 'Failed to process document due to a server error.',
      details: errorMessage,
      qdrantError: qdrantErrorData,
      fullErrorStack: errorDetails
    }, { status: errorStatus });
  }
} 