import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs'; // Import Node.js file system module
import { ensureCollectionExists, getQdrantClient } from '../src/lib/vector/qdrantClient';

// Determine the correct path to .env.local
// __dirname is /Users/trentmunday/lucient/scripts
// .env.local is in /Users/trentmunday/lucient/
const envPath = path.resolve(__dirname, '../.env.local');

// --- Manual File Read Debug --- 
console.log(`Manually checking file at: ${envPath}`);
try {
  if (fs.existsSync(envPath)) {
    const fileContent = fs.readFileSync(envPath, { encoding: 'utf8' });
    console.log("Manually read .env.local content (first 150 chars):\n--BEGIN--\n", fileContent.substring(0, 150), "\n--END--");
  } else {
    console.log(".env.local does NOT exist at the specified path according to fs.existsSync.");
  }
} catch (err) {
  console.error("Error manually reading .env.local:", err);
}
// --- End Manual File Read Debug ---

console.log(`Attempting to load .env.local with dotenv from: ${envPath}`);
dotenv.config({ path: envPath, override: true, debug: true }); // Added debug for dotenv

const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || "lucient_documents";

async function getSamplePoints(collectionName: string = COLLECTION_NAME, limit: number = 5) {
  const client = getQdrantClient();
  try {
    console.log(`\nAttempting to retrieve up to ${limit} sample points from '${collectionName}'...`);
    const scrollResult = await client.scroll(collectionName, {
      limit: limit,
      with_payload: true, // So we can see what was stored
      with_vector: false, // No need to see the full vector for confirmation
    });

    if (scrollResult.points && scrollResult.points.length > 0) {
      console.log(`Successfully retrieved ${scrollResult.points.length} sample points:`);
      scrollResult.points.forEach((point, idx) => {
        console.log(`  Point ${idx + 1}:`);
        console.log(`    ID: ${point.id}`);
        console.log(`    Payload: ${JSON.stringify(point.payload, null, 2)}`);
      });
    } else {
      console.log(`No points found in collection '${collectionName}' or an error occurred while retrieving them.`);
    }
    if (scrollResult.next_page_offset) {
      console.log(`\nThere are more points in the collection. Next page offset: ${scrollResult.next_page_offset}`);
    }
  } catch (error) {
    console.error(`Error retrieving sample points from '${collectionName}':`, error);
  }
}

async function main() {
  console.log("Starting Qdrant setup script...");
  console.log("QDRANT_URL from process.env:", process.env.QDRANT_URL);
  console.log("QDRANT_API_KEY from process.env is set:", !!process.env.QDRANT_API_KEY);
  try {
    await ensureCollectionExists();
    await getSamplePoints();
    console.log("Qdrant setup script completed successfully.");
  } catch (error) {
    console.error("Error during Qdrant setup script:", error);
    process.exit(1);
  }
}

main().catch(console.error); 