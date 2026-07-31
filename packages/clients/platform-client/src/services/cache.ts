/**
 * Cache Service
 * 
 * High-level caching API built on Redis.
 * Provides tool response caching with automatic TTL and invalidation.
 * 
 * FEATURES:
 * - Tool response caching (reduces backend API calls)
 * - Automatic TTL management
 * - Cache key generation from tool parameters
 * - Graceful fallback when Redis unavailable
 * 
 * BEST PRACTICES (from redis.io docs):
 * - Use Hashes for grouped data (10x memory efficiency)
 * - allkeys-lru eviction policy for caches
 * - Semantic caching for AI responses
 * 
 * @module services/cache
 */

import { getRedis, isRedisAvailable, recordCacheHit, recordCacheMiss, getCacheHitRate, getRedisStatus } from "./redis.js";
import crypto from "crypto";

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Default TTL for cached tool responses (5 minutes) */
const DEFAULT_TOOL_TTL = 300;

/** TTL for different types of data */
const TTL_CONFIG = {
  /** Tool responses - refreshed frequently */
  tool: 300,           // 5 minutes
  
  /** Inventory/availability - short TTL */
  inventory: 60,       // 1 minute
  
  /** Product catalog - longer TTL */
  catalog: 900,        // 15 minutes
  
  /** Pricing - medium TTL */
  pricing: 300,        // 5 minutes
  
  /** Static content - long TTL */
  static: 3600,        // 1 hour
};

// ============================================================================
// KEY GENERATION
// ============================================================================

/**
 * Generate a cache key for a tool call
 * 
 * @param toolName - Name of the tool being called
 * @param params - Tool parameters (will be hashed)
 * @returns Cache key string
 */
export function generateToolCacheKey(toolName: string, params: Record<string, unknown>): string {
  // Sort params for consistent hashing
  const sortedParams = JSON.stringify(params, Object.keys(params).sort());
  const hash = crypto.createHash('md5').update(sortedParams).digest('hex').substring(0, 12);
  return `tool:${toolName}:${hash}`;
}

/**
 * Generate a cache key for user context
 */
export function generateUserContextKey(userId: string): string {
  return `user:${userId}:context`;
}

/**
 * Generate a cache key for conversation summary
 */
export function generateConversationSummaryKey(conversationId: string): string {
  return `conv:${conversationId}:summary`;
}

// ============================================================================
// TOOL RESPONSE CACHING
// ============================================================================

/**
 * Get a cached tool response
 * 
 * @param toolName - Name of the tool
 * @param params - Tool parameters
 * @returns Cached response or null if not cached
 */
export async function getCachedToolResponse<T = unknown>(
  toolName: string,
  params: Record<string, unknown>
): Promise<T | null> {
  if (!isRedisAvailable()) return null;
  
  const redis = getRedis();
  if (!redis) return null;
  
  try {
    const key = generateToolCacheKey(toolName, params);
    const cached = await redis.get(key);
    
    if (cached !== null) {
      console.log(`[cache] HIT: ${toolName}`);
      recordCacheHit();
      // Handle both string and Buffer responses from node-redis
      const dataStr = typeof cached === 'string' ? cached : cached.toString();
      return JSON.parse(dataStr) as T;
    }
    
    console.log(`[cache] MISS: ${toolName}`);
    recordCacheMiss();
    return null;
  } catch (error) {
    console.error('[cache] Get error:', error);
    return null;
  }
}

/**
 * Cache a tool response
 * 
 * @param toolName - Name of the tool
 * @param params - Tool parameters
 * @param response - Response to cache
 * @param ttlSeconds - Time to live in seconds (optional)
 */
export async function cacheToolResponse(
  toolName: string,
  params: Record<string, unknown>,
  response: unknown,
  ttlSeconds?: number
): Promise<void> {
  if (!isRedisAvailable()) return;
  
  const redis = getRedis();
  if (!redis) return;
  
  try {
    const key = generateToolCacheKey(toolName, params);
    const ttl = ttlSeconds ?? determineTTL(toolName);
    
    // node-redis v4+ uses setEx (not setex)
    await redis.setEx(key, ttl, JSON.stringify(response));
    console.log(`[cache] SET: ${toolName} (TTL: ${ttl}s)`);
  } catch (error) {
    console.error('[cache] Set error:', error);
  }
}

/**
 * Invalidate cached tool responses matching a pattern
 * 
 * @param toolName - Tool name to invalidate (or '*' for all)
 */
export async function invalidateToolCache(toolName: string = '*'): Promise<number> {
  if (!isRedisAvailable()) return 0;
  
  const redis = getRedis();
  if (!redis) return 0;
  
  try {
    const pattern = `tool:${toolName}:*`;
    const keys = await redis.keys(pattern);
    
    if (keys.length > 0) {
      // node-redis v4+ del takes array
      await redis.del(keys);
      console.log(`[cache] Invalidated ${keys.length} keys matching ${pattern}`);
    }
    
    return keys.length;
  } catch (error) {
    console.error('[cache] Invalidation error:', error);
    return 0;
  }
}

/**
 * Determine TTL based on tool name patterns
 */
function determineTTL(toolName: string): number {
  const lowerName = toolName.toLowerCase();
  
  if (lowerName.includes('inventory') || lowerName.includes('availability') || lowerName.includes('stock')) {
    return TTL_CONFIG.inventory;
  }
  
  if (lowerName.includes('catalog') || lowerName.includes('menu') || lowerName.includes('list')) {
    return TTL_CONFIG.catalog;
  }
  
  if (lowerName.includes('price') || lowerName.includes('cost') || lowerName.includes('rate')) {
    return TTL_CONFIG.pricing;
  }
  
  if (lowerName.includes('info') || lowerName.includes('about') || lowerName.includes('hours')) {
    return TTL_CONFIG.static;
  }
  
  return TTL_CONFIG.tool;
}

// ============================================================================
// CACHE STATS
// ============================================================================

interface CacheStats {
  available: boolean;
  status: string;
  hitRate: number;
  error: string | null;
}

/**
 * Get cache statistics (uses centralized redis stats)
 */
export function getCacheStats(): CacheStats {
  const redisStatus = getRedisStatus();
  
  return {
    available: redisStatus.available,
    status: redisStatus.status,
    hitRate: getCacheHitRate(),
    error: redisStatus.error,
  };
}
