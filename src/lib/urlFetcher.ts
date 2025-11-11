import * as cheerio from 'cheerio';
import * as pdf from 'pdf-parse/lib/pdf-parse.js';

export interface FetchedContent {
  text: string;
  title?: string;
  url: string;
  contentType: 'html' | 'pdf' | 'text';
  metadata?: Record<string, unknown>;
}

/**
 * Fetches content from a URL and extracts the main text content
 * Handles HTML pages, PDFs, and plain text
 */
export async function fetchUrlContent(url: string): Promise<FetchedContent> {
  console.log(`[URL_FETCHER] Fetching content from: ${url}`);

  try {
    // Fetch the URL with browser-like headers to avoid bot detection
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'Referer': new URL(url).origin,
      },
    });

    if (!response.ok) {
      // Provide more helpful error messages for common status codes
      if (response.status === 403) {
        throw new Error(`Access forbidden (403). The website may be blocking automated requests. Try downloading the content manually and uploading it as a file instead.`);
      } else if (response.status === 404) {
        throw new Error(`Page not found (404). The URL may be incorrect or the content may have been removed.`);
      } else if (response.status === 401) {
        throw new Error(`Unauthorized (401). The website may require authentication or login.`);
      } else {
        throw new Error(`HTTP error! status: ${response.status}. The website returned an error.`);
      }
    }

    const contentType = response.headers.get('content-type') || '';
    const urlLower = url.toLowerCase();

    // Check if it's a PDF
    if (
      contentType.includes('application/pdf') ||
      urlLower.endsWith('.pdf') ||
      contentType.includes('application/octet-stream') && urlLower.endsWith('.pdf')
    ) {
      console.log('[URL_FETCHER] Detected PDF, parsing...');
      return await fetchPdfContent(url, response);
    }

    // Check if it's HTML
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      console.log('[URL_FETCHER] Detected HTML, extracting content...');
      return await fetchHtmlContent(url, response);
    }

    // Try to parse as text
    console.log('[URL_FETCHER] Treating as plain text...');
    const text = await response.text();
    return {
      text: text.trim(),
      url,
      contentType: 'text',
      metadata: {
        content_type: contentType,
      },
    };
  } catch (error) {
    console.error(`[URL_FETCHER] Error fetching ${url}:`, error);
    // If it's already a helpful error message, re-throw it as-is
    if (error instanceof Error && (
        error.message.includes('Access forbidden') || 
        error.message.includes('Page not found') || 
        error.message.includes('Unauthorized'))) {
      throw error;
    }
    // Otherwise, wrap it with context
    throw new Error(`Failed to fetch content from URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetches and parses PDF content from a URL
 */
async function fetchPdfContent(url: string, response: Response): Promise<FetchedContent> {
  try {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const data = await pdf.default(buffer, {});
    const text = data.text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/[ \t]{3,}/g, ' ')
      .trim();

    return {
      text,
      title: (typeof data.info?.Title === 'string' ? data.info.Title : null) || url.split('/').pop() || 'PDF Document',
      url,
      contentType: 'pdf',
      metadata: {
        pages: data.numpages,
        pdf_info: data.info,
      },
    };
  } catch (error) {
    console.error('[URL_FETCHER] Error parsing PDF:', error);
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetches and extracts main content from HTML page
 */
async function fetchHtmlContent(url: string, response: Response): Promise<FetchedContent> {
  try {
    const html = await response.text();
    
    // Try to use Readability with dynamic imports (to handle ESM modules)
    try {
      const { JSDOM } = await import('jsdom');
      const { Readability } = await import('@mozilla/readability');
      
      const dom = new JSDOM(html, { url });
      const document = dom.window.document;

      // Use Mozilla Readability to extract main content
      const reader = new Readability(document);
      const article = reader.parse();

      if (article && article.content) {
        // Use Readability's extracted content
        const $ = cheerio.load(article.content);
        // Remove script and style tags
        $('script, style').remove();
        const text = $('body').text() || $.root().text()
          .replace(/\s+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        return {
          text,
          title: article.title || document.title || url.split('/').pop() || 'Web Page',
          url,
          contentType: 'html',
          metadata: {
            excerpt: article.excerpt,
            byline: article.byline,
            site_name: article.siteName,
          },
        };
      }
    } catch (readabilityError) {
      console.log('[URL_FETCHER] Readability unavailable, using fallback extraction:', readabilityError);
    }

    // Fallback: extract text from body using cheerio (works without jsdom)
    console.log('[URL_FETCHER] Using cheerio-based extraction');
    const $ = cheerio.load(html);
    
    // Remove unwanted elements
    $('script, style, nav, header, footer, aside, .advertisement, .ad, .sidebar, .menu, .navigation').remove();
    
    // Try to get main content from common article/content selectors
    const mainContent = $('article, main, .content, .post, .entry-content, #content').first();
    const bodyText = mainContent.length > 0 
      ? mainContent.text() 
      : $('body').text() || $.root().text();
    
    const text = bodyText
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const title = $('title').first().text() || 
                  $('meta[property="og:title"]').attr('content') ||
                  $('h1').first().text() ||
                  url.split('/').pop() || 
                  'Web Page';

    return {
      text,
      title: title.trim(),
      url,
      contentType: 'html',
      metadata: {
        extraction_method: 'cheerio',
      },
    };
  } catch (error) {
    console.error('[URL_FETCHER] Error parsing HTML:', error);
    throw new Error(`Failed to parse HTML: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

