import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getDocumentChunks } from '@/lib/textProcessing/chunking';
import { upsertDocumentChunks } from '@/lib/vector/supabaseVectorClient';
import mammoth from 'mammoth'; // For .doc, .docx
import * as pdf from 'pdf-parse/lib/pdf-parse.js'; // For .pdf


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

  // Check if user is admin - only admins can upload documents to shared knowledge base
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('user_tier')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('[API/DOCS_UPSERT] Error fetching user profile:', profileError?.message);
    return NextResponse.json({ error: 'Failed to fetch user profile.' }, { status: 500 });
  }

  if (profile.user_tier !== 'admin') {
    console.error(`[API/DOCS_UPSERT] Non-admin user ${user.id} attempted to upload document.`);
    return NextResponse.json({ error: 'Only admins can upload documents to the knowledge base.' }, { status: 403 });
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

    console.log('[API/DOCS_UPSERT] Starting document processing for Supabase...');
    
    // Convert chunks to the format expected by our Supabase client
    const documentChunks = chunks.map(chunk => ({
      text: chunk.pageContent,
      metadata: chunk.metadata
    }));

    console.log(`[API/DOCS_UPSERT] Upserting ${documentChunks.length} chunks to Supabase for user: ${user.id}`);
    await upsertDocumentChunks(documentChunks, user.id, file.name, fileContent);
    console.log(`[API/DOCS_UPSERT] Successfully upserted ${documentChunks.length} chunks to Supabase.`);

    return NextResponse.json(
      {
        message: 'Document processed and embedded successfully.',
        fileName: file.name,
        chunks: chunks.length,
        database: 'Supabase',
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('[API/DOCS_UPSERT] Critical error in POST handler. Full error object:', error);

    let errorMessage = 'An unknown server error occurred.';
    let errorDetails: string | undefined = undefined;
    let errorStatus = 500;

    if (typeof error === 'object' && error !== null) {
      // Check for common error patterns
      if ('status' in error && typeof (error as { status: unknown }).status === 'number') {
        errorStatus = (error as { status: number }).status;
      }

      if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
        errorMessage = (error as { message: string }).message;
      }
      
      if ('statusText' in error && typeof (error as { statusText: unknown }).statusText === 'string' && errorStatus !== 500) {
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
      fullErrorStack: errorDetails
    }, { status: errorStatus });
  }
} 