const mongoose = require('mongoose');

/**
 * Runs a set of operations in a MongoDB transaction with a graceful fallback
 * if the MongoDB deployment is a standalone instance that does not support transactions.
 * @param {Function} fn - Asynchronous function containing the database operations. Receives the session object.
 */
async function runInTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    // CommandNotSupported, CommandNotFound, or specific message matches indicate no replica set support
    const isUnsupported = 
      error.message.includes('Transaction numbers are only allowed') || 
      error.codeName === 'CommandNotSupported' ||
      error.code === 20;

    if (isUnsupported) {
      console.warn('[Transaction] MongoDB standalone detected. Executing without transactions.');
      return await fn(null);
    }
    
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

module.exports = { runInTransaction };
