import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getDocumentChunks } from '@/lib/textProcessing/chunking';
import { upsertDocumentChunks } from '@/lib/vector/supabaseVectorClient';
import { fetchUrlContent } from '@/lib/urlFetcher';

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
    console.error('[API/DOCS_UPSERT_URL] Unauthorized access:', authError);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is admin - only admins can upload documents to shared knowledge base
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('user_tier')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('[API/DOCS_UPSERT_URL] Error fetching user profile:', profileError?.message);
    return NextResponse.json({ error: 'Failed to fetch user profile.' }, { status: 500 });
  }

  if (profile.user_tier !== 'admin') {
    console.error(`[API/DOCS_UPSERT_URL] Non-admin user ${user.id} attempted to add URL.`);
    return NextResponse.json({ error: 'Only admins can add URLs to the knowledge base.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      console.log('[API/DOCS_UPSERT_URL] No URL provided in request body.');
      return NextResponse.json({ error: 'URL is required and must be a string' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    console.log(`[API/DOCS_UPSERT_URL] Processing URL: ${url}`);

    // Fetch and extract content from URL
    const fetchedContent = await fetchUrlContent(url);
    console.log(`[API/DOCS_UPSERT_URL] Fetched content. Type: ${fetchedContent.contentType}, Length: ${fetchedContent.text.length}`);

    if (!fetchedContent.text || fetchedContent.text.trim() === '') {
      console.log('[API/DOCS_UPSERT_URL] Extracted content is empty.');
      return NextResponse.json({ error: 'No content could be extracted from the URL.' }, { status: 400 });
    }

    console.log('[API/DOCS_UPSERT_URL] Starting chunking...');
    // Use the same chunking defaults as file uploads
    const chunks = await getDocumentChunks(fetchedContent.text);
    console.log(`[API/DOCS_UPSERT_URL] Content chunked into ${chunks.length} pieces.`);

    if (chunks.length === 0) {
      console.log('[API/DOCS_UPSERT_URL] Content is empty after chunking.');
      return NextResponse.json({ error: 'Content is empty after chunking.' }, { status: 400 });
    }

    console.log('[API/DOCS_UPSERT_URL] Starting document processing for Supabase...');

    // Convert chunks to the format expected by our Supabase client
    // Add URL-specific metadata to each chunk
    const documentChunks = chunks.map(chunk => ({
      text: chunk.pageContent,
      metadata: {
        ...chunk.metadata,
        source_type: 'url',
        source_url: url,
        content_type: fetchedContent.contentType,
        title: fetchedContent.title,
        fetched_at: new Date().toISOString(),
        ...(fetchedContent.metadata || {}),
      },
    }));

    // Use URL as the file_name (or a cleaned version)
    // This will be used for citations in RAG responses
    const fileName = fetchedContent.title 
      ? `${fetchedContent.title} (${url})`
      : url;

    console.log(`[API/DOCS_UPSERT_URL] Upserting ${documentChunks.length} chunks to Supabase for user: ${user.id}`);
    await upsertDocumentChunks(documentChunks, user.id, fileName, fetchedContent.text);
    console.log(`[API/DOCS_UPSERT_URL] Successfully upserted ${documentChunks.length} chunks to Supabase.`);

    return NextResponse.json(
      {
        message: 'URL processed and embedded successfully.',
        url,
        title: fetchedContent.title,
        contentType: fetchedContent.contentType,
        chunks: chunks.length,
        database: 'Supabase',
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('[API/DOCS_UPSERT_URL] Critical error in POST handler. Full error object:', error);

    let errorMessage = 'An unknown server error occurred.';
    let errorDetails: string | undefined = undefined;
    let errorStatus = 500;

    if (typeof error === 'object' && error !== null) {
      if ('status' in error && typeof (error as { status: unknown }).status === 'number') {
        errorStatus = (error as { status: number }).status;
      }

      if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
        errorMessage = (error as { message: string }).message;
      }

      if ('statusText' in error && typeof (error as { statusText: unknown }).statusText === 'string' && errorStatus !== 500) {
        errorMessage = `Error ${errorStatus}: ${(error as { statusText: string }).statusText}`;
      }

      if (error instanceof Error && error.stack) {
        errorDetails = error.stack;
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    return NextResponse.json({
      error: 'Failed to process URL due to a server error.',
      details: errorMessage,
      fullErrorStack: errorDetails
    }, { status: errorStatus });
  }
}

