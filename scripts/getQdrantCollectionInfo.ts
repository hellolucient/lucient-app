import { getQdrantClient, QDRANT_COLLECTION_NAME } from '../src/lib/vector/qdrantClient';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
const GREEN_OUTPUT = "\x1b[32m%s\x1b[0m";
const RED_OUTPUT = "\x1b[31m%s\x1b[0m";

dotenv.config({ path: envPath, debug: process.env.DOTENV_DEBUG === 'true' });

async function getCollectionInfo() {
  console.log('Attempting to retrieve Qdrant collection information...');
  console.log(`Using QDRANT_URL: ${process.env.QDRANT_URL ? 'Loaded' : 'Not Loaded'}`);
  console.log(`Using QDRANT_API_KEY: ${process.env.QDRANT_API_KEY ? 'Loaded' : 'Not Loaded'}`);
  console.log(`Target collection: ${QDRANT_COLLECTION_NAME}`);

  if (!process.env.QDRANT_URL) {
    console.error(RED_OUTPUT, 'Error: QDRANT_URL environment variable is not set.');
    console.log('Please ensure QDRANT_URL is correctly set in your .env.local file, which should be in the project root.');
    return;
  }

  if (!QDRANT_COLLECTION_NAME) {
    console.error(RED_OUTPUT, 'Error: QDRANT_COLLECTION_NAME is not defined in constants.');
    return;
  }

  try {
    const qdrantClient = getQdrantClient();
    console.log('Qdrant client initialized.');

    console.log(`Fetching information for collection: "${QDRANT_COLLECTION_NAME}"...`);
    const collectionInfo = await qdrantClient.getCollection(QDRANT_COLLECTION_NAME);

    console.log(GREEN_OUTPUT, '\nCollection Information:');
    console.log('-------------------------');
    console.log(`Name: ${QDRANT_COLLECTION_NAME}`);
    console.log(`Status: ${collectionInfo.status}`);
    console.log(`Optimizer Status: ${collectionInfo.optimizer_status}`);
    console.log(`Vectors Count: ${collectionInfo.vectors_count ?? collectionInfo.points_count ?? 'N/A'}`); // points_count is preferred for newer clients
    console.log(`Indexed Vectors Count: ${collectionInfo.indexed_vectors_count ?? 'N/A'}`);
    console.log(`Points Count: ${collectionInfo.points_count ?? 'N/A'}`);
    console.log('Configuration:');
    console.dir(collectionInfo.config, { depth: null });
    console.log('Payload Schema:');
    console.dir(collectionInfo.payload_schema, { depth: null });
    console.log('-------------------------');
    console.log(GREEN_OUTPUT, 'Successfully retrieved collection information.');

  } catch (error) {
    console.error(RED_OUTPUT, 'Failed to retrieve Qdrant collection information:');
    if (error instanceof Error) {
      console.error(RED_OUTPUT, error.message);
      if (error.stack) {
        // console.error(error.stack);
      }
      // Log additional details if it's a Qdrant API error-like object
      if (typeof error === 'object' && error !== null) {
        const qdrantError = error as any;
        if (qdrantError.status || qdrantError.remoteMessage || qdrantError.data) {
          console.error('Status:', qdrantError.status);
          console.error('Remote Message:', qdrantError.remoteMessage);
          console.error('Data:', qdrantError.data);
        }
      }
    } else {
      console.error(RED_OUTPUT, 'An unknown error occurred:', error);
    }
  }
}

getCollectionInfo(); 