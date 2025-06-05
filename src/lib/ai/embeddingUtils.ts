// Placeholder for embedding functions
// This could use OpenAI, LlamaIndex, or other embedding models

// import OpenAI from 'openai'; // Removed: Not used as openai client is imported directly
import { openai } from './openai'; // Use the pre-configured client from openai.ts

// Recommended embedding model by OpenAI (as of late 2023/early 2024)
const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Generates an embedding for the given text using OpenAI's API.
 * @param text The text to generate an embedding for.
 * @returns A promise that resolves to an array of numbers representing the embedding.
 * @throws An error if the embedding generation fails or no embedding is returned.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || typeof text !== 'string') {
    throw new Error("Input text must be a non-empty string.");
  }

  console.log(`Generating embedding for text snippet: "${text.substring(0, 80)}..." using ${EMBEDDING_MODEL}`);

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.replace(/\n/g, ' '), // OpenAI recommends replacing newlines with a space for better performance
      // dimensions: 1536 // Optional: text-embedding-3-small defaults to 1536, can be reduced for some use cases
    });

    if (response.data && response.data.length > 0 && response.data[0].embedding) {
      console.log(`Successfully generated embedding of dimension ${response.data[0].embedding.length}`);
      return response.data[0].embedding;
    } else {
      console.error("Failed to generate embedding or received an empty response from OpenAI.", response);
      throw new Error("Failed to generate embedding: No embedding data received from OpenAI.");
    }
  } catch (error: unknown) {
    let errorMessage = "Unknown error during embedding generation.";
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error("Error generating embedding with OpenAI:", errorMessage);
    } else {
      console.error("Error generating embedding with OpenAI (non-standard error):", error);
    }
    // Consider re-throwing a more specific error or handling it based on the error type
    throw new Error(`OpenAI embedding generation failed: ${errorMessage}`);
  }
}

// Example of how you might use this for multiple texts (batching is often more efficient if API supports it directly)
// export async function generateEmbeddingsForMultipleTexts(texts: string[]): Promise<number[][]> {
//   // Note: openai.embeddings.create can take an array of strings as input directly.
//   try {
//     const response = await openai.embeddings.create({
//       model: EMBEDDING_MODEL,
//       input: texts.map(text => text.replace(/\n/g, ' ')),
//     });
//     return response.data.map(item => item.embedding);
//   } catch (error: any) {
//     console.error("Error generating batch embeddings with OpenAI:", error.message);
//     throw new Error(`OpenAI batch embedding generation failed: ${error.message}`);
//   }
// }

// Add other embedding related utility functions here 