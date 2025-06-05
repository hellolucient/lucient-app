import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from 'langchain/document';

interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

interface DocumentChunk {
  pageContent: string;
  metadata: Record<string, any>; // Can be more specific based on needs
}

// Basic text chunking function
export async function getDocumentChunks(
  text: string,
  options: ChunkingOptions = {}
): Promise<DocumentChunk[]> {
  const { chunkSize = 1000, chunkOverlap = 200 } = options;

  if (!text || text.trim() === '') {
    return [];
  }

  // Using Langchain's text splitter as it's robust
  // We might need to install 'langchain' if not already present
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    // separators: ["\n\n", "\n", " ", ""], // Default separators
  });

  const documents: Document[] = await splitter.createDocuments([text]);
  
  // The createDocuments method returns Document objects which have pageContent and metadata
  return documents.map((doc: Document) => ({
    pageContent: doc.pageContent,
    metadata: doc.metadata || {}, // Ensure metadata is at least an empty object
  }));
} 