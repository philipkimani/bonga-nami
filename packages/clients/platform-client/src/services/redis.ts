/**
 * Redis Service
 * 
 * Centralized Redis connection management for the platform.
 * Each client deployment configures their own Redis URL.
 * 
 * ARCHITECTURE:
 * - Single-tenant: Each client has their own Redis instance
 * - Uses official node-redis client (recommended by redis.io)
 * - Graceful fallback when Redis unavailable
 * 
 * SUPPORTED PROVIDERS:
 * - Upstash (serverless, recommended for Railway)
 * - Railway Redis
 * - Redis Cloud
 * - Any Redis-compatible service
 * 
 * PRODUCTION BEST PRACTICES (from redis.io docs):
 * - Always handle 'error' event (critical - prevents crashes)
 * - Use socket.connectTimeout for connection timeouts
 * - Use socket.reconnectStrategy for exponential backoff
 * - Use Hashes for memory efficiency (10x savings)
 * - allkeys-lru eviction policy for caches
 * 
 * @module services/redis
 */

import { createClient, type RedisClientType } from "redis";

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Connection timeout in milliseconds (10 seconds) */
const CONNECT_TIMEOUT = 10000;

/** Maximum number of retry attempts */
const MAX_RETRIES = 5;

/** Base delay for exponential backoff (ms) */
const RETRY_BASE_DELAY = 100;

/** Maximum retry delay (ms) */
const RETRY_MAX_DELAY = 3000;

// ============================================================================
// TYPES
// ============================================================================

type RedisClient = ReturnType<typeof createClient>;

// ============================================================================
// STATE
// ============================================================================

let redis: RedisClient | null = null;
let connectionStatus: 'not_initialized' | 'connecting' | 'connected' | 'failed' = 'not_initialized';
let connectionError: string | null = null;

/** Cache statistics for monitoring */
const stats = {
  hits: 0,
  misses: 0,
  errors: 0,
  lastReconnect: null as Date | null,
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the Redis client instance.
 * Returns null if Redis is not configured or unavailable.
 */
export function getRedis(): RedisClient | null {
  if (connectionStatus === 'connected' && redis?.isReady) {
    return redis;
  }
  return null;
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return connectionStatus === 'connected' && redis !== null && redis.isReady;
}

/**
 * Get Redis connection status for health checks
 */
export function getRedisStatus(): {
  available: boolean;
  status: string;
  error: string | null;
  stats: typeof stats;
} {
  return {
    available: isRedisAvailable(),
    status: connectionStatus,
    error: connectionError,
    stats,
  };
}

/**
 * Record a cache hit (for stats)
 */
export function recordCacheHit(): void {
  stats.hits++;
}

/**
 * Record a cache miss (for stats)
 */
export function recordCacheMiss(): void {
  stats.misses++;
}

/**
 * Get cache hit rate percentage
 */
export function getCacheHitRate(): number {
  const total = stats.hits + stats.misses;
  if (total === 0) return 0;
  return Math.round((stats.hits / total) * 100);
}

/**
 * Initialize Redis connection
 * Called on startup if REDIS_URL is set
 * 
 * Production best practices from redis.io:
 * - Always handle 'error' event (critical - prevents crashes)
 * - Use exponential backoff for reconnection
 * - Set connection timeouts
 */
export async function initializeRedis(): Promise<boolean> {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    console.log('[redis] No REDIS_URL configured - caching disabled');
    connectionStatus = 'not_initialized';
    return false;
  }
  
  if (connectionStatus === 'connected' && redis?.isReady) {
    return true;
  }
  
  connectionStatus = 'connecting';
  
  try {
    console.log('[redis] Connecting to Redis...');
    
    redis = createClient({
      url: redisUrl,
      socket: {
        // Connection timeout (from redis.io production docs)
        connectTimeout: CONNECT_TIMEOUT,
        
        // Exponential backoff reconnection strategy
        reconnectStrategy: (retries) => {
          if (retries > MAX_RETRIES) {
            console.error(`[redis] Max retries (${MAX_RETRIES}) reached, giving up`);
            return new Error('Max retries reached');
          }
          const delay = Math.min(retries * RETRY_BASE_DELAY, RETRY_MAX_DELAY);
          console.log(`[redis] Reconnecting in ${delay}ms (attempt ${retries}/${MAX_RETRIES})`);
          stats.lastReconnect = new Date();
          return delay;
        },
      },
    });
    
    // CRITICAL: Error event handler (from redis.io production docs)
    // "This event is triggered whenever an error occurs within the client,
    //  and it is very important to set a handler to listen for it."
    redis.on('error', (err: Error) => {
      const msg = err?.message || String(err) || 'Unknown error';
      console.error('[redis] Redis error:', msg);
      stats.errors++;
      connectionError = msg;
    });
    
    // Handle reconnection events
    redis.on('reconnecting', () => {
      connectionStatus = 'connecting';
      console.log('[redis] Reconnecting...');
    });
    
    // Handle ready event (connection established and ready for commands)
    redis.on('ready', () => {
      connectionStatus = 'connected';
      connectionError = null;
      console.log('[redis] ✅ Ready to accept commands');
    });
    
    // Connect to Redis
    await redis.connect();
    
    connectionStatus = 'connected';
    connectionError = null;
    console.log('[redis] ✅ Connected to Redis');
    
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[redis] ❌ Failed to connect:', message);
    connectionStatus = 'failed';
    connectionError = message;
    redis = null;
    return false;
  }
}

/**
 * Disconnect from Redis (for graceful shutdown)
 */
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    try {
      await redis.quit();
    } catch {
      // Ignore errors during shutdown
    }
    redis = null;
    connectionStatus = 'not_initialized';
    console.log('[redis] Disconnected');
  }
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

// Handle process termination gracefully
process.on('SIGTERM', async () => {
  console.log('[redis] SIGTERM received, disconnecting...');
  await disconnectRedis();
});

process.on('SIGINT', async () => {
  console.log('[redis] SIGINT received, disconnecting...');
  await disconnectRedis();
});
