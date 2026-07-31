/**
 * Analytics Types & Utilities
 * 
 * Conversation metrics tracking for the platform.
 * Designed for single-tenant deployments - each instance tracks its own data.
 * 
 * @module @platform/core/analytics
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Conversation status lifecycle
 */
export type ConversationStatus = 'active' | 'completed' | 'abandoned' | 'error';

/**
 * Channel through which conversation occurred
 */
export type ConversationChannel = 'web' | 'voice' | 'whatsapp' | 'sms';

/**
 * Single conversation record
 */
export interface ConversationRecord {
  id: string;
  sessionId: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  
  // Timing
  startedAt: Date;
  endedAt?: Date;
  durationSeconds?: number;
  
  // Metrics
  messageCount: number;
  userMessageCount: number;
  agentMessageCount: number;
  toolCallCount: number;
  
  // Cost tracking (estimated)
  tokensUsed?: number;
  estimatedCost?: number;
  
  // Context
  industry?: string;
  conversationMode?: 'text_only' | 'voice_and_text' | 'voice_only';
  
  // Outcome
  endReason?: 'user_ended' | 'inactivity_timeout' | 'max_duration' | 'error' | 'agent_ended';
  
  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated metrics for dashboard
 */
export interface AnalyticsSummary {
  // Time range
  periodStart: Date;
  periodEnd: Date;
  
  // Volume
  totalConversations: number;
  completedConversations: number;
  abandonedConversations: number;
  errorConversations: number;
  
  // Performance
  avgDurationSeconds: number;
  avgMessageCount: number;
  avgToolCalls: number;
  
  // Cost
  totalTokensUsed: number;
  totalEstimatedCost: number;
  
  // Breakdown by channel
  byChannel: Record<ConversationChannel, number>;
  
  // Breakdown by hour (for charts)
  byHour: { hour: number; count: number }[];
  
  // Top end reasons
  endReasons: { reason: string; count: number }[];
}

/**
 * Daily aggregated stats (stored in DB)
 */
export interface DailyStats {
  date: string; // YYYY-MM-DD
  totalConversations: number;
  completedConversations: number;
  abandonedConversations: number;
  errorConversations: number;
  totalDurationSeconds: number;
  totalMessages: number;
  totalToolCalls: number;
  totalTokensUsed: number;
  totalEstimatedCost: number;
  byChannel: Record<ConversationChannel, number>;
}

// ============================================================================
// IN-MEMORY METRICS COLLECTOR
// ============================================================================

/**
 * Simple in-memory metrics collector.
 * 
 * For single-tenant deployments, this provides basic analytics
 * without requiring external analytics services.
 * 
 * Data persists to database when available, with in-memory buffer
 * for active conversations.
 */
class MetricsCollector {
  private activeConversations: Map<string, ConversationRecord> = new Map();
  private recentCompleted: ConversationRecord[] = [];
  private maxRecentCompleted = 100; // Keep last 100 in memory
  
  /**
   * Start tracking a new conversation
   */
  startConversation(params: {
    conversationId: string;
    sessionId: string;
    channel: ConversationChannel;
    industry?: string;
    conversationMode?: 'text_only' | 'voice_and_text' | 'voice_only';
    metadata?: Record<string, unknown>;
  }): ConversationRecord {
    const record: ConversationRecord = {
      id: params.conversationId,
      sessionId: params.sessionId,
      channel: params.channel,
      status: 'active',
      startedAt: new Date(),
      messageCount: 0,
      userMessageCount: 0,
      agentMessageCount: 0,
      toolCallCount: 0,
      industry: params.industry,
      conversationMode: params.conversationMode,
      metadata: params.metadata,
    };
    
    this.activeConversations.set(params.conversationId, record);
    console.log(`[analytics] Started conversation ${params.conversationId}`);
    
    return record;
  }
  
  /**
   * Record a message in an active conversation
   */
  recordMessage(conversationId: string, role: 'user' | 'agent'): void {
    const record = this.activeConversations.get(conversationId);
    if (!record) return;
    
    record.messageCount++;
    if (role === 'user') {
      record.userMessageCount++;
    } else {
      record.agentMessageCount++;
    }
  }
  
  /**
   * Record a tool call
   */
  recordToolCall(conversationId: string): void {
    const record = this.activeConversations.get(conversationId);
    if (!record) return;
    
    record.toolCallCount++;
  }
  
  /**
   * End a conversation and move to completed
   */
  endConversation(
    conversationId: string,
    endReason: ConversationRecord['endReason'],
    tokensUsed?: number
  ): ConversationRecord | null {
    const record = this.activeConversations.get(conversationId);
    if (!record) return null;
    
    // Calculate duration
    record.endedAt = new Date();
    record.durationSeconds = Math.round(
      (record.endedAt.getTime() - record.startedAt.getTime()) / 1000
    );
    record.endReason = endReason;
    record.tokensUsed = tokensUsed;
    
    // Estimate cost (rough: $0.01 per 1000 tokens)
    if (tokensUsed) {
      record.estimatedCost = (tokensUsed / 1000) * 0.01;
    }
    
    // Set status based on end reason
    if (endReason === 'error') {
      record.status = 'error';
    } else if (endReason === 'inactivity_timeout') {
      record.status = 'abandoned';
    } else {
      record.status = 'completed';
    }
    
    // Move to completed list
    this.activeConversations.delete(conversationId);
    this.recentCompleted.unshift(record);
    
    // Trim to max size
    if (this.recentCompleted.length > this.maxRecentCompleted) {
      this.recentCompleted.pop();
    }
    
    console.log(`[analytics] Ended conversation ${conversationId}: ${endReason} (${record.durationSeconds}s)`);
    
    return record;
  }
  
  /**
   * Get an active conversation
   */
  getActiveConversation(conversationId: string): ConversationRecord | undefined {
    return this.activeConversations.get(conversationId);
  }
  
  /**
   * Get all active conversations
   */
  getActiveConversations(): ConversationRecord[] {
    return Array.from(this.activeConversations.values());
  }
  
  /**
   * Get recent completed conversations
   */
  getRecentConversations(limit = 20): ConversationRecord[] {
    return this.recentCompleted.slice(0, limit);
  }
  
  /**
   * Get real-time summary stats
   */
  getSummary(): {
    activeCount: number;
    todayCount: number;
    todayCompleted: number;
    todayAbandoned: number;
    avgDuration: number;
    avgMessages: number;
  } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayConversations = this.recentCompleted.filter(
      c => c.startedAt >= today
    );
    
    const completed = todayConversations.filter(c => c.status === 'completed');
    const abandoned = todayConversations.filter(c => c.status === 'abandoned');
    
    const avgDuration = completed.length > 0
      ? completed.reduce((sum, c) => sum + (c.durationSeconds || 0), 0) / completed.length
      : 0;
    
    const avgMessages = completed.length > 0
      ? completed.reduce((sum, c) => sum + c.messageCount, 0) / completed.length
      : 0;
    
    return {
      activeCount: this.activeConversations.size,
      todayCount: todayConversations.length,
      todayCompleted: completed.length,
      todayAbandoned: abandoned.length,
      avgDuration: Math.round(avgDuration),
      avgMessages: Math.round(avgMessages * 10) / 10,
    };
  }
  
  /**
   * Clear all data (for testing)
   */
  reset(): void {
    this.activeConversations.clear();
    this.recentCompleted = [];
  }
}

// Export singleton instance
export const metricsCollector = new MetricsCollector();

// Export class for testing
export { MetricsCollector };
