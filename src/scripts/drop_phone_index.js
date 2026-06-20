/*
 * Migration: Drop non-sparse phone_1 index and recreate as unique, sparse index.
 * 
 * Run with:
 *   node src/scripts/drop_phone_index.js
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
    const db = client.db(process.env.MONGODB_DB_NAME || 'MathswithSD_DB');
    const collection = db.collection('phonerecords');

    console.log('Fetching indexes for phonerecords...');
    const indexes = await collection.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    const phoneIndex = indexes.find(idx => idx.name === 'phone_1');

    if (phoneIndex) {
      if (!phoneIndex.sparse) {
        console.log('Found non-sparse phone_1 index. Dropping index...');
        await collection.dropIndex('phone_1');
        console.log('✓ phone_1 index dropped.');
      } else {
        console.log('phone_1 index is already sparse. No action needed for dropping.');
      }
    }

    console.log('Creating unique, sparse index on "phone"...');
    await collection.createIndex({ phone: 1 }, { unique: true, sparse: true });
    console.log('✓ Unique sparse index on "phone" created successfully.');

    // Double check indexes
    const postIndexes = await collection.indexes();
    console.log('Remaining/Updated indexes:');
    console.log(JSON.stringify(postIndexes, null, 2));
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
