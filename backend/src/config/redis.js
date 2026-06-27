'use strict';

const { createClient } = require('redis');
const logger = require('./logger');

let client = null;

const connectRedis = async () => {
  try {
    client = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            return new Error('Redis connection failed permanently');
          }
          return Math.min(retries * 50, 2000);
        }
      },
      password: process.env.REDIS_PASSWORD || undefined,
      url: process.env.REDIS_URL
    });

    client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    client.on('reconnecting', () => {
      logger.warn('Redis client reconnecting...');
    });

    await client.connect();
    return client;
  } catch (error) {
    logger.error('Redis connection failed:', error);
    // Don't throw - Redis is optional, app can work without it
    logger.warn('Continuing without Redis cache...');
    return null;
  }
};

const getRedisClient = () => client;

const set = async (key, value, ttlSeconds = 3600) => {
  if (!client) return null;
  try {
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    await client.set(key, serialized, { EX: ttlSeconds });
    return true;
  } catch (err) {
    logger.error('Redis SET error:', err);
    return null;
  }
};

const get = async (key) => {
  if (!client) return null;
  try {
    const value = await client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (err) {
    logger.error('Redis GET error:', err);
    return null;
  }
};

const del = async (key) => {
  if (!client) return null;
  try {
    await client.del(key);
    return true;
  } catch (err) {
    logger.error('Redis DEL error:', err);
    return null;
  }
};

const flush = async (pattern) => {
  if (!client) return null;
  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
    return true;
  } catch (err) {
    logger.error('Redis FLUSH error:', err);
    return null;
  }
};

module.exports = connectRedis;
module.exports.getRedisClient = getRedisClient;
module.exports.set = set;
module.exports.get = get;
module.exports.del = del;
module.exports.flush = flush;
