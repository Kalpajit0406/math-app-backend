/*
 * Migration: Drop TTL Index from testresponses collection.
 * 
 * Run with:
 *   node src/scripts/drop_ttl_index.js
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  if (!MONGODB_URI) {
    console.error('Error: MONGODB_URI is not set in env variables.');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('testresponses');

    console.log('Fetching indexes for testresponses...');
    const indexes = await collection.indexes();
    const ttlIndex = indexes.find(idx => idx.name === 'createdAt_1' || idx.key.createdAt !== undefined);

    if (ttlIndex) {
      if (ttlIndex.expireAfterSeconds !== undefined) {
        console.log(`Found TTL index: "${ttlIndex.name}" with expireAfterSeconds: ${ttlIndex.expireAfterSeconds}`);
        console.log('Dropping TTL index...');
        await collection.dropIndex(ttlIndex.name);
        console.log('✓ TTL index successfully dropped.');
      } else {
        console.log(`Found index "${ttlIndex.name}" but it is not a TTL index (expireAfterSeconds is undefined). No action taken.`);
      }
    } else {
      console.log('No index found on "createdAt" field. Index might have already been dropped.');
    }

    // Verify after change
    const postIndexes = await collection.indexes();
    console.log('Remaining indexes:');
    console.log(JSON.stringify(postIndexes, null, 2));
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
