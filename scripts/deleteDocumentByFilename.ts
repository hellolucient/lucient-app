import { getQdrantClient, QDRANT_COLLECTION_NAME } from '../src/lib/vector/qdrantClient.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env.local
const __filename_esm = fileURLToPath(import.meta.url);
const __dirname_esm = path.dirname(__filename_esm);
const envPath = path.resolve(__dirname_esm, '../.env.local');
const GREEN_OUTPUT = "\x1b[32m%s\x1b[0m";
const RED_OUTPUT = "\x1b[31m%s\x1b[0m";
const YELLOW_OUTPUT = "\x1b[33m%s\x1b[0m";

dotenv.config({ path: envPath, debug: process.env.DOTENV_DEBUG === 'true' });

async function deleteDocumentByFilename(filenameToDelete: string) {
  console.log(`Attempting to delete document chunks for filename: "${filenameToDelete}" from collection "${QDRANT_COLLECTION_NAME}"`);

  if (!process.env.QDRANT_URL) {
    console.error(RED_OUTPUT, 'Error: QDRANT_URL environment variable is not set.');
    return;
  }
  if (!QDRANT_COLLECTION_NAME) {
    console.error(RED_OUTPUT, 'Error: QDRANT_COLLECTION_NAME is not defined.');
    return;
  }
  if (!filenameToDelete) {
    console.error(RED_OUTPUT, 'Error: No filename provided to delete.');
    console.log(YELLOW_OUTPUT, 'Usage: npx ts-node scripts/deleteDocumentByFilename.ts <filename_to_delete>');
    return;
  }

  try {
    const qdrantClient = getQdrantClient();
    console.log('Qdrant client initialized.');

    const filterObject = {
      must: [
        {
          key: 'fileName', 
          match: {
            value: filenameToDelete,
          },
        },
      ],
    };

    console.log(`Constructed filter: ${JSON.stringify(filterObject, null, 2)}`);
    console.log(YELLOW_OUTPUT, `\nWARNING: This will attempt to delete all points matching the filename "${filenameToDelete}" from the collection "${QDRANT_COLLECTION_NAME}".\n`);
    
    try {
      const countResponse = await qdrantClient.count(QDRANT_COLLECTION_NAME, { filter: filterObject, exact: true });
      console.log(`Found ${countResponse.count} points matching the filename "${filenameToDelete}".`);
      if (countResponse.count === 0) {
        console.log(GREEN_OUTPUT, 'No points found with that filename. Nothing to delete.');
        return;
      }
    } catch (countError: any) {
      console.warn(YELLOW_OUTPUT, `Could not retrieve count of points before deletion. Error: ${countError.message}`);
      console.warn(YELLOW_OUTPUT, `Proceeding with deletion attempt...`);
    }

    console.log(`Attempting to delete points using client.delete()...`);
    // Using client.delete() as an alternative if deletePoints is not available or has a different signature
    // The exact signature for deleting by filter can vary. Common patterns include passing a filter object directly
    // or within a points selector. This assumes the filter can be passed like this.
    const deleteResult = await qdrantClient.delete(QDRANT_COLLECTION_NAME, { filter: filterObject });
    
    console.log(GREEN_OUTPUT, 'Deletion operation submitted. Result:');
    console.dir(deleteResult, { depth: null });

    // The structure of deleteResult can vary. Checking for a status property.
    // Qdrant delete operations usually return "acknowledged" or "completed".
    if (deleteResult && (deleteResult.status === 'acknowledged' || deleteResult.status === 'completed')) {
      console.log(GREEN_OUTPUT, `Successfully submitted deletion for points associated with filename: "${filenameToDelete}".`);
      console.log(YELLOW_OUTPUT, `Note: Deletion in Qdrant is an operation that might take some time to fully complete and reflect in counts.`);
    } else {
      console.error(RED_OUTPUT, `Deletion operation may not have been successful or status unknown. Result status: ${deleteResult?.status}`);
    }

  } catch (error: any) {
    console.error(RED_OUTPUT, 'Failed to delete document chunks from Qdrant:');
    if (error.message) {
      console.error(RED_OUTPUT, error.message);
    }
    if (error.stack) {
      // console.error(error.stack);
    }
    if (error.data) {
      console.error(RED_OUTPUT, `Qdrant error data: ${JSON.stringify(error.data, null, 2)}`);
    }
     // More generic error logging if specific properties aren't found
     if (typeof error === 'object' && error !== null && error.hasOwnProperty('status')) {
        console.error(RED_OUTPUT, `Error Status: ${error.status}`);
    }
  }
}

const filenameArg = process.argv[2];

if (!filenameArg) {
  console.error(RED_OUTPUT, 'Error: Please provide the filename to delete as a command-line argument.');
  console.log(YELLOW_OUTPUT, 'Usage: npx ts-node scripts/deleteDocumentByFilename.ts <filename_to_delete>');
} else {
  deleteDocumentByFilename(filenameArg);
} 