// Placeholder for Qdrant client setup

import { QdrantClient } from "@qdrant/js-client-rest";

let qdrantClient: QdrantClient;
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || "lucient_documents";
const VECTOR_SIZE = 1536; // For OpenAI text-embedding-3-small and ada-002

export const QDRANT_COLLECTION_NAME = COLLECTION_NAME;

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

/**
 * Ensures that a payload index exists for a given field in a collection.
 * @param collectionName The name of the collection.
 * @param fieldName The name of the payload field to index.
 * @param fieldType The type of the payload index (e.g., "keyword", "integer", "text").
 */
export async function ensurePayloadIndexExists(
  collectionName: string = QDRANT_COLLECTION_NAME, // Assuming QDRANT_COLLECTION_NAME is defined in this file
  fieldName: string,
  fieldType: "keyword" | "integer" | "float" | "bool" | "geo" | "text"
) {
  const client = getQdrantClient();
  try {
    console.log(`Checking payload index for field '${fieldName}' in collection '${collectionName}'...`);
    const collectionInfo = await client.getCollection(collectionName);

    // Check if the index already exists. The exact structure of payload_schema might vary.
    // Some versions might list indexed fields directly or under a specific key.
    // This is a common way to check if a field is indexed as a keyword.
    if (collectionInfo.payload_schema && collectionInfo.payload_schema[fieldName]?.data_type === fieldType) {
        // A more robust check might be needed depending on how Qdrant version represents this.
        // Sometimes it's just checking if collectionInfo.payload_schema[fieldName] exists for simpler types.
        // For text indexes, it might have specific indexing parameters.
        const fieldSchema = collectionInfo.payload_schema[fieldName];
        if (fieldSchema && fieldSchema.data_type === fieldType) {
             // For text indexes, params might differ, for keyword, existence with correct type is key.
             console.log(`Payload index for field '${fieldName}' of type '${fieldType}' already exists in '${collectionName}'.`);
             return;
        }
    }
    
    // If we get here, index might not exist or not with the exact type, or payload_schema isn't detailed enough.
    // We will attempt to create it. createPayloadIndex is idempotent for most setups but good to log.
    console.log(`Payload index for field '${fieldName}' of type '${fieldType}' not found or type mismatch. Attempting to create/update...`);
    await client.createPayloadIndex(collectionName, {
      field_name: fieldName,
      field_schema: fieldType,
      // For text indexes, you might add tokenizer: "word" or other params here
    });
    console.log(`Successfully created/ensured payload index for field '${fieldName}' of type '${fieldType}' in collection '${collectionName}'.`);

  } catch (error: any) {
    // If createPayloadIndex fails because it already exists with different parameters, error handling might be complex.
    // For now, we assume basic keyword index creation.
    if (error.message && error.message.includes("already exists")) {
        console.warn(`Payload index for field '${fieldName}' might already exist with different parameters or couldn't be confirmed: ${error.message}`);
    } else {
        console.error(`Error ensuring payload index for field '${fieldName}' in collection '${collectionName}':`, error);
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