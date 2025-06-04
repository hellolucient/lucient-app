// Placeholder for Qdrant client setup

import { QdrantClient } from "@qdrant/js-client-rest";

let qdrantClient: QdrantClient;

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