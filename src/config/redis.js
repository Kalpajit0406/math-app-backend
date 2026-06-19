const Redis = require('ioredis');

class MockRedis {
  constructor() {
    this.store = new Map();
    this.events = {};
  }

  on(event, callback) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
    return this;
  }

  emit(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach(cb => cb(...args));
    }
  }

  async set(key, value, ...args) {
    let nx = false;
    let px = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === 'NX') nx = true;
      if (args[i] === 'PX') px = args[i+1];
    }
    if (nx && this.store.has(key)) {
      return null;
    }
    this.store.set(key, value);
    if (px) {
      setTimeout(() => {
        if (this.store.get(key) === value) {
          this.store.delete(key);
        }
      }, px);
    }
    return 'OK';
  }

  async get(key) {
    return this.store.get(key) || null;
  }

  async del(key) {
    this.store.delete(key);
    return 1;
  }

  async hset(key, field, value) {
    if (!this.store.has(key)) {
      this.store.set(key, new Map());
    }
    const map = this.store.get(key);
    map.set(field, value);
    return 1;
  }

  async hget(key, field) {
    const map = this.store.get(key);
    if (!map || !(map instanceof Map)) return null;
    return map.get(field) || null;
  }

  async hdel(key, field) {
    const map = this.store.get(key);
    if (!map || !(map instanceof Map)) return 0;
    const deleted = map.delete(field);
    return deleted ? 1 : 0;
  }

  async hgetall(key) {
    const map = this.store.get(key);
    if (!map || !(map instanceof Map)) return {};
    const obj = {};
    for (const [k, v] of map.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  async zadd(key, score, value) {
    if (!this.store.has(key)) {
      this.store.set(key, new Map());
    }
    const map = this.store.get(key);
    map.set(value, score);
    return 1;
  }

  async rpush(key, value) {
    if (!this.store.has(key)) {
      this.store.set(key, []);
    }
    const arr = this.store.get(key);
    arr.push(value);
    return arr.length;
  }

  async publish(channel, message) {
    this.emit(channel, message);
    return 1;
  }

  multi() {
    const operations = [];
    const chain = {
      hset: (key, field, value) => {
        operations.push(() => this.hset(key, field, value));
        return chain;
      },
      zadd: (key, score, value) => {
        operations.push(() => this.zadd(key, score, value));
        return chain;
      },
      hdel: (key, field) => {
        operations.push(() => this.hdel(key, field));
        return chain;
      },
      exec: async () => {
        const results = [];
        for (const op of operations) {
          results.push(await op());
        }
        return results;
      }
    };
    return chain;
  }

  async eval(script, numkeys, ...args) {
    const pendingKey = args[0];
    const processingKey = args[1];
    const jobsKey = args[2];
    const timestamp = args[3];

    const pendingMap = this.store.get(pendingKey);
    if (!pendingMap || !(pendingMap instanceof Map) || pendingMap.size === 0) {
      return null;
    }

    let minScore = Infinity;
    let minVal = null;
    for (const [val, score] of pendingMap.entries()) {
      if (score < minScore) {
        minScore = score;
        minVal = val;
      }
    }

    if (minVal === null) return null;
    pendingMap.delete(minVal);
    await this.hset(processingKey, minVal, timestamp);
    const jobJson = await this.hget(jobsKey, minVal);
    return [minVal, jobJson];
  }
}

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let activeClient = null;

const isConnectionError = (err) => {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('econnrefused') ||
    msg.includes('closed') ||
    msg.includes('not writeable') ||
    msg.includes('offline') ||
    msg.includes('connection is not established') ||
    msg.includes('stream is not readable') ||
    msg.includes('command queue is disabled')
  );
};

function getRedisClient() {
  if (!activeClient) {
    const realClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      enableOfflineQueue: false, // Immediately reject commands when connection is down
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.slice(0, targetError.length) === targetError) {
          return true;
        }
        return false;
      }
    });

    const mockClient = new MockRedis();
    let useMock = false;

    activeClient = new Proxy(realClient, {
      get(target, prop) {
        if (useMock) {
          const value = mockClient[prop];
          if (typeof value === 'function') {
            return value.bind(mockClient);
          }
          return value;
        }

        const value = target[prop];
        if (typeof value === 'function') {
          return function(...args) {
            try {
              const res = value.apply(target, args);
              if (res instanceof Promise) {
                return res.catch(err => {
                  if (isConnectionError(err)) {
                    if (process.env.NODE_ENV === 'production') {
                      console.error('CRITICAL REDIS ERROR: Redis connection failed in production!');
                      process.exit(1);
                    }
                    if (!useMock) {
                      console.warn('⚠️ Redis connection failed. Falling back to in-memory MockRedis.');
                      useMock = true;
                    }
                    const mockVal = mockClient[prop];
                    if (typeof mockVal === 'function') {
                      return mockVal.apply(mockClient, args);
                    }
                  }
                  throw err;
                });
              }
              return res;
            } catch (err) {
              if (isConnectionError(err)) {
                if (process.env.NODE_ENV === 'production') {
                  console.error('CRITICAL REDIS ERROR: Redis connection failed in production!');
                  process.exit(1);
                }
                if (!useMock) {
                  console.warn('⚠️ Redis connection failed. Falling back to in-memory MockRedis.');
                  useMock = true;
                }
                const mockVal = mockClient[prop];
                if (typeof mockVal === 'function') {
                  return mockVal.apply(mockClient, args);
                }
              }
              throw err;
            }
          };
        }
        return value;
      }
    });

    realClient.on('connect', () => {
      console.log('✓ Connected to Redis server');
      useMock = false;
    });

    realClient.on('error', (err) => {
      if (isConnectionError(err)) {
        if (process.env.NODE_ENV === 'production') {
          console.error('CRITICAL REDIS ERROR: Redis server is unreachable in production environment!');
          process.exit(1);
        }
        if (!useMock) {
          console.warn('⚠️ Redis server is unreachable. Falling back to high-performance in-memory MockRedis.');
          useMock = true;
        }
      } else if (!useMock) {
        console.error('Redis client error:', err.message);
      }
    });
  }
  return activeClient;
}

module.exports = { getRedisClient, REDIS_URL };
