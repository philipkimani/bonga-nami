/**
 * User Memory Service
 * 
 * Stores user context and preferences across conversations.
 * Enables personalization: "I remember you prefer morning appointments"
 * 
 * FEATURES:
 * - User preferences storage
 * - Conversation history summaries
 * - Cross-session memory
 * - Automatic expiration
 * 
 * PRIVACY:
 * - Data stored in client's own Redis (single-tenant)
 * - No cross-client data access
 * - Configurable retention periods
 * 
 * @module services/user-memory
 */

import { getRedis, isRedisAvailable } from "./redis.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Default TTL for user context (30 days) */
const USER_CONTEXT_TTL = 60 * 60 * 24 * 30;

/** Default TTL for conversation summaries (7 days) */
const CONVERSATION_SUMMARY_TTL = 60 * 60 * 24 * 7;

/** Maximum number of conversation summaries to keep per user */
const MAX_CONVERSATION_HISTORY = 10;

// ============================================================================
// TYPES
// ============================================================================

export interface UserContext {
  /** User identifier (phone number, email, or session ID) */
  userId: string;
  
  /** User's display name if known */
  name?: string;
  
  /** User's preferred language */
  language?: string;
  
  /** User preferences extracted from conversations */
  preferences: Record<string, string>;
  
  /** Important facts about the user */
  facts: string[];
  
  /** Last interaction timestamp */
  lastInteraction: string;
  
  /** Total number of conversations */
  conversationCount: number;
  
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

export interface ConversationSummary {
  /** Conversation ID */
  conversationId: string;
  
  /** When the conversation happened */
  timestamp: string;
  
  /** Channel used (voice, chat, whatsapp) */
  channel: string;
  
  /** Brief summary of what was discussed */
  summary: string;
  
  /** Key topics discussed */
  topics: string[];
  
  /** Any actions taken or outcomes */
  outcomes: string[];
  
  /** Sentiment of the conversation */
  sentiment?: 'positive' | 'neutral' | 'negative';
}

// ============================================================================
// USER CONTEXT
// ============================================================================

/**
 * Get user context from memory
 * 
 * @param userId - User identifier (phone, email, or session ID)
 * @returns User context or null if not found
 */
export async function getUserContext(userId: string): Promise<UserContext | null> {
  if (!isRedisAvailable()) return null;
  
  const redis = getRedis();
  if (!redis) return null;
  
  try {
    const key = `user:${userId}:context`;
    const data = await redis.get(key);
    
    if (data !== null) {
      console.log(`[user-memory] Found context for user: ${maskUserId(userId)}`);
      // Handle both string and Buffer responses from node-redis
      const dataStr = typeof data === 'string' ? data : data.toString();
      return JSON.parse(dataStr) as UserContext;
    }
    
    return null;
  } catch (error) {
    console.error('[user-memory] Get context error:', error);
    return null;
  }
}

/**
 * Save or update user context
 * 
 * @param context - User context to save
 */
export async function saveUserContext(context: UserContext): Promise<void> {
  if (!isRedisAvailable()) return;
  
  const redis = getRedis();
  if (!redis) return;
  
  try {
    const key = `user:${context.userId}:context`;
    context.lastInteraction = new Date().toISOString();
    
    // node-redis v4+ uses setEx (not setex)
    await redis.setEx(key, USER_CONTEXT_TTL, JSON.stringify(context));
    console.log(`[user-memory] Saved context for user: ${maskUserId(context.userId)}`);
  } catch (error) {
    console.error('[user-memory] Save context error:', error);
  }
}

/**
 * Update user preferences
 * Merges new preferences with existing ones
 */
export async function updateUserPreferences(
  userId: string,
  preferences: Record<string, string>
): Promise<void> {
  const context = await getUserContext(userId) ?? createEmptyContext(userId);
  context.preferences = { ...context.preferences, ...preferences };
  await saveUserContext(context);
}

/**
 * Add a fact about the user
 */
export async function addUserFact(userId: string, fact: string): Promise<void> {
  const context = await getUserContext(userId) ?? createEmptyContext(userId);
  
  // Avoid duplicates
  if (!context.facts.includes(fact)) {
    context.facts.push(fact);
    // Keep only last 20 facts
    if (context.facts.length > 20) {
      context.facts = context.facts.slice(-20);
    }
    await saveUserContext(context);
  }
}

/**
 * Delete user context (for privacy/GDPR compliance)
 */
export async function deleteUserContext(userId: string): Promise<boolean> {
  if (!isRedisAvailable()) return false;
  
  const redis = getRedis();
  if (!redis) return false;
  
  try {
    const keys = await redis.keys(`user:${userId}:*`);
    if (keys.length > 0) {
      // node-redis v4+ del takes array
      await redis.del(keys);
      console.log(`[user-memory] Deleted all data for user: ${maskUserId(userId)}`);
    }
    return true;
  } catch (error) {
    console.error('[user-memory] Delete error:', error);
    return false;
  }
}

// ============================================================================
// CONVERSATION SUMMARIES
// ============================================================================

/**
 * Save a conversation summary
 */
export async function saveConversationSummary(
  userId: string,
  summary: ConversationSummary
): Promise<void> {
  if (!isRedisAvailable()) return;
  
  const redis = getRedis();
  if (!redis) return;
  
  try {
    // Save individual summary (node-redis v4+ uses setEx)
    const summaryKey = `conv:${summary.conversationId}:summary`;
    await redis.setEx(summaryKey, CONVERSATION_SUMMARY_TTL, JSON.stringify(summary));
    
    // Add to user's conversation history list (node-redis v4+ uses lPush, lTrim)
    const historyKey = `user:${userId}:conversations`;
    await redis.lPush(historyKey, summary.conversationId);
    await redis.lTrim(historyKey, 0, MAX_CONVERSATION_HISTORY - 1);
    await redis.expire(historyKey, USER_CONTEXT_TTL);
    
    // Update user's conversation count
    const context = await getUserContext(userId);
    if (context) {
      context.conversationCount++;
      await saveUserContext(context);
    }
    
    console.log(`[user-memory] Saved conversation summary: ${summary.conversationId}`);
  } catch (error) {
    console.error('[user-memory] Save summary error:', error);
  }
}

/**
 * Get recent conversation summaries for a user
 */
export async function getUserConversationHistory(
  userId: string,
  limit: number = 5
): Promise<ConversationSummary[]> {
  if (!isRedisAvailable()) return [];
  
  const redis = getRedis();
  if (!redis) return [];
  
  try {
    const historyKey = `user:${userId}:conversations`;
    // node-redis v4+ uses lRange (not lrange)
    const conversationIds = await redis.lRange(historyKey, 0, limit - 1);
    
    const summaries: ConversationSummary[] = [];
    for (const convId of conversationIds) {
      const summaryKey = `conv:${convId}:summary`;
      const data = await redis.get(summaryKey);
      if (data !== null) {
        // Handle both string and Buffer responses from node-redis
        const dataStr = typeof data === 'string' ? data : data.toString();
        summaries.push(JSON.parse(dataStr) as ConversationSummary);
      }
    }
    
    return summaries;
  } catch (error) {
    console.error('[user-memory] Get history error:', error);
    return [];
  }
}

// ============================================================================
// CONTEXT BUILDER FOR LLM
// ============================================================================

/**
 * Build a context string for the LLM based on user memory
 * This can be injected into tool responses or system prompts
 */
export async function buildUserContextForLLM(userId: string): Promise<string | null> {
  const context = await getUserContext(userId);
  if (!context) return null;
  
  const parts: string[] = [];
  
  // Add user name if known
  if (context.name) {
    parts.push(`User's name: ${context.name}`);
  }
  
  // Add preferences
  if (Object.keys(context.preferences).length > 0) {
    const prefs = Object.entries(context.preferences)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    parts.push(`User preferences: ${prefs}`);
  }
  
  // Add important facts
  if (context.facts.length > 0) {
    parts.push(`Known facts: ${context.facts.join('; ')}`);
  }
  
  // Add conversation history summary
  const history = await getUserConversationHistory(userId, 3);
  if (history.length > 0) {
    const historyStr = history
      .map(h => `- ${h.timestamp.split('T')[0]}: ${h.summary}`)
      .join('\n');
    parts.push(`Recent conversations:\n${historyStr}`);
  }
  
  return parts.length > 0 ? parts.join('\n\n') : null;
}

// ============================================================================
// HELPERS
// ============================================================================

function createEmptyContext(userId: string): UserContext {
  return {
    userId,
    preferences: {},
    facts: [],
    lastInteraction: new Date().toISOString(),
    conversationCount: 0,
  };
}

function maskUserId(userId: string): string {
  if (userId.length <= 6) return '***';
  return userId.substring(0, 3) + '***' + userId.substring(userId.length - 3);
}
