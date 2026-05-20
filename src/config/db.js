const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { ensureIndexes } = require('../utils/indexes');

dotenv.config();

const DEFAULT_RETRY_DELAY_MS = 2000;
const MAX_RETRIES = Number.parseInt(process.env.MONGODB_MAX_RETRIES || '5', 10);
const RETRY_DELAY_MS = Number.parseInt(process.env.MONGODB_RETRY_DELAY_MS || `${DEFAULT_RETRY_DELAY_MS}`, 10);

const isSrvDnsError = (error) => {
  const msg = String(error?.message || '');
  return msg.includes('querySrv') || error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED';
};

const getConnectionUris = () => {
  const primary = process.env.MONGODB_URI;
  const fallback = process.env.MONGODB_URI_DIRECT;
  if (!fallback || fallback === primary) return [primary];
  return [primary, fallback];
};

const validateDbName = () => {
  const dbName = process.env.MONGODB_DB_NAME;
  if (!dbName) return;
  if (/\s/.test(dbName)) {
    console.warn('MONGODB_DB_NAME contains spaces. Prefer names like "MathswithSD_DB".');
  }
};

const getConnectionOptions = () => ({
  dbName: process.env.MONGODB_DB_NAME || undefined,
  maxPoolSize: Number.parseInt(process.env.MONGODB_MAX_POOL_SIZE || '20', 10),
  minPoolSize: Number.parseInt(process.env.MONGODB_MIN_POOL_SIZE || '2', 10),
  serverSelectionTimeoutMS: Number.parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '10000', 10),
  socketTimeoutMS: Number.parseInt(process.env.MONGODB_SOCKET_TIMEOUT_MS || '45000', 10),
  autoIndex: process.env.NODE_ENV !== 'production',
  bufferCommands: false,
});

let listenersBound = false;
const bindConnectionListeners = () => {
  if (listenersBound) return;
  listenersBound = true;

  mongoose.connection.on('connected', () => {
    console.log('MongoDB connection established');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });
  mongoose.connection.on('error', (err) => {
    console.error(`MongoDB connection error: ${err.message}`);
  });
};

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured');
  }

  validateDbName();
  bindConnectionListeners();
  const uris = getConnectionUris();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    for (let i = 0; i < uris.length; i += 1) {
      const uri = uris[i];
      const isFallback = i > 0;
      try {
        const conn = await mongoose.connect(uri, getConnectionOptions());
        console.log(`MongoDB Connected: ${conn.connection.host}${isFallback ? ' (fallback URI)' : ''}`);
        
        // Create database indexes for performance
        await ensureIndexes(mongoose);
        
        return conn;
      } catch (error) {
        const isLastUri = i === uris.length - 1;
        const canRetry = attempt < MAX_RETRIES;
        const shouldRetry = canRetry && (isLastUri || !isSrvDnsError(error));
        console.error(
          `MongoDB connection attempt ${attempt}/${MAX_RETRIES}${isFallback ? ' [fallback]' : ''} failed: ${error.message}`,
        );
        if (!isLastUri) continue;
        if (!shouldRetry) throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
};

module.exports = connectDB;
