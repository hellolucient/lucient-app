// Placeholder for Qdrant client setup

import { QdrantClient } from "@qdrant/js-client-rest";

let qdrantClient: QdrantClient;
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || "lucient_documents";
const VECTOR_SIZE = 1536; // For OpenAI text-embedding-3-small and ada-002

export function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    if (!process.env.QDRANT_URL) {
      throw new Error("QDRANT_URL environment variable is not set.");
    }
    // The API key can be omitted if Qdrant is running unsecured or with other auth methods.
    // an empty string for apiKey might cause issues with some versions of the client if auth is expected.
    // if QDRANT_API_KEY is optional for your setup, you might need to conditionally include it.
    qdrantClient = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY, // Can be undefined if not set
    });
    console.log("Qdrant client initialized.");
  }
  return qdrantClient;
}

/**
 * Ensures that the specified Qdrant collection exists, creating it if necessary.
 * @param collectionName The name of the collection to ensure exists.
 * @param vectorSize The size of the vectors to be stored in this collection.
 * @param distance The distance metric to use (e.g., "Cosine", "Euclid", "Dot").
 */
export async function ensureCollectionExists(
  collectionName: string = COLLECTION_NAME,
  vectorSize: number = VECTOR_SIZE,
  distance: "Cosine" | "Euclid" | "Dot" = "Cosine"
) {
  const client = getQdrantClient();
  try {
    console.log(`Checking if collection '${collectionName}' exists...`);
    await client.getCollection(collectionName);
    console.log(`Collection '${collectionName}' already exists.`);
  } catch (error: any) {
    // A 404 error likely means the collection doesn't exist.
    // Other errors could be network issues, auth problems, etc.
    if (error.status === 404 || (error.message && error.message.includes("Not found"))) {
      console.log(`Collection '${collectionName}' does not exist. Creating it...`);
      await client.createCollection(collectionName, {
        vectors: {
          size: vectorSize,
          distance: distance,
        },
      });
      console.log(`Collection '${collectionName}' created successfully with vector size ${vectorSize} and ${distance} distance.`);
    } else {
      console.error(`Error checking or creating collection '${collectionName}':`, error);
      throw error; // Re-throw other errors
    }
  }
}

// Example usage (you might call this once during app startup or from a setup script):
// ensureCollectionExists().catch(console.error);

// Example usage (you might put this in a test or an admin script):
/*
async function listQdrantCollections() {
  try {
    const client = getQdrantClient();
    const collections = await client.getCollections();
    console.log("Available Qdrant collections:", collections);
  } catch (error) {
    console.error("Error listing Qdrant collections:", error);
  }
}

// listQdrantCollections();
*/

export default getQdrantClient; // Default export for convenience if preferred 