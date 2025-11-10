import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from 'langchain/document';

interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

interface DocumentChunk {
  pageContent: string;
  metadata: Record<string, unknown>; // Changed 'any' to 'unknown'
}

// Enhanced text chunking function with better context preservation
export async function getDocumentChunks(
  text: string,
  options: ChunkingOptions = {}
): Promise<DocumentChunk[]> {
  // Increased default chunk size and overlap to preserve more context
  // Larger chunks = more context, larger overlap = less information loss at boundaries
  const { chunkSize = 1500, chunkOverlap = 400 } = options;

  if (!text || text.trim() === '') {
    return [];
  }

  // Using Langchain's text splitter with optimized separators
  // Separators are ordered by priority - tries to split on paragraphs first, then sentences, then words
  // This preserves semantic meaning better than just character-based splitting
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: [
      "\n\n\n",      // Triple newline (section breaks)
      "\n\n",        // Double newline (paragraphs)
      "\n",          // Single newline (lines)
      ". ",          // Sentence endings with space
      "! ",          // Exclamation with space
      "? ",          // Question with space
      "; ",          // Semicolon with space
      ", ",          // Comma with space
      " ",           // Space
      ""             // Character (last resort)
    ],
  });

  const documents: Document[] = await splitter.createDocuments([text]);
  
  // The createDocuments method returns Document objects which have pageContent and metadata
  return documents.map((doc: Document) => ({
    pageContent: doc.pageContent,
    metadata: doc.metadata || {}, // Ensure metadata is at least an empty object
  }));
} 