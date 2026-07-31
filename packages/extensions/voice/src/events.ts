/**
 * CONVERSATION EVENTS — Event System for ElevenLabs Integration
 * 
 * This module provides an event system for tracking conversation events.
 * Events are emitted during voice conversations for analytics, logging,
 * and integration with external systems.
 * 
 * 📚 ElevenLabs Documentation:
 * - https://elevenlabs.io/docs/agents-platform/customization/conversation-events
 * 
 * @since v3.1.0
 */

import type { 
  ConversationEvent, 
  ConversationEventType,
  ToolCallEventData,
  ToolCompletedEventData,
} from "./types.js";

// ============================================================================
// EVENT LISTENER TYPES
// ============================================================================

export type ConversationEventListener<T = unknown> = (event: ConversationEvent<T>) => void;

export type ConversationEventListenerMap = {
  [K in ConversationEventType]?: ConversationEventListener[];
};

// ============================================================================
// EVENT EMITTER
// ============================================================================

/**
 * Conversation event emitter for tracking and analytics
 */
export class ConversationEventEmitter {
  private listeners: ConversationEventListenerMap = {};
  private allListeners: ConversationEventListener[] = [];
  
  /**
   * Subscribe to a specific event type
   */
  on<T = unknown>(
    eventType: ConversationEventType, 
    listener: ConversationEventListener<T>
  ): () => void {
    if (!this.listeners[eventType]) {
      this.listeners[eventType] = [];
    }
    this.listeners[eventType]!.push(listener as ConversationEventListener);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners[eventType];
      if (listeners) {
        const index = listeners.indexOf(listener as ConversationEventListener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }
  
  /**
   * Subscribe to all events
   */
  onAll(listener: ConversationEventListener): () => void {
    this.allListeners.push(listener);
    
    return () => {
      const index = this.allListeners.indexOf(listener);
      if (index > -1) {
        this.allListeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Emit an event
   */
  emit<T = unknown>(event: ConversationEvent<T>): void {
    console.log(`[ConversationEvents] ${event.type}`, event.data);
    
    // Notify specific listeners
    const listeners = this.listeners[event.type];
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`[ConversationEvents] Listener error:`, error);
        }
      });
    }
    
    // Notify all listeners
    this.allListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error(`[ConversationEvents] All-listener error:`, error);
      }
    });
  }
  
  /**
   * Remove all listeners
   */
  removeAllListeners(): void {
    this.listeners = {};
    this.allListeners = [];
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a conversation started event
 */
export function createConversationStartedEvent(
  conversationId: string,
  tenantId: string,
  data: { mode: "text" | "voice"; userId?: string }
): ConversationEvent {
  return {
    type: "conversation.started",
    conversationId,
    tenantId,
    timestamp: new Date(),
    data,
  };
}

/**
 * Create a conversation ended event
 */
export function createConversationEndedEvent(
  conversationId: string,
  tenantId: string,
  data: { durationMs: number; messageCount: number; reason: string }
): ConversationEvent {
  return {
    type: "conversation.ended",
    conversationId,
    tenantId,
    timestamp: new Date(),
    data,
  };
}

/**
 * Create a tool called event
 */
export function createToolCalledEvent(
  conversationId: string,
  tenantId: string,
  data: ToolCallEventData
): ConversationEvent<ToolCallEventData> {
  return {
    type: "conversation.tool.called",
    conversationId,
    tenantId,
    timestamp: new Date(),
    data,
  };
}

/**
 * Create a tool completed event
 */
export function createToolCompletedEvent(
  conversationId: string,
  tenantId: string,
  data: ToolCompletedEventData
): ConversationEvent<ToolCompletedEventData> {
  return {
    type: "conversation.tool.completed",
    conversationId,
    tenantId,
    timestamp: new Date(),
    data,
  };
}

/**
 * Create a user message event
 */
export function createUserMessageEvent(
  conversationId: string,
  tenantId: string,
  data: { message: string; source: "voice" | "text" }
): ConversationEvent {
  return {
    type: "conversation.message.user",
    conversationId,
    tenantId,
    timestamp: new Date(),
    data,
  };
}

/**
 * Create an agent message event
 */
export function createAgentMessageEvent(
  conversationId: string,
  tenantId: string,
  data: { message: string; isFinal: boolean }
): ConversationEvent {
  return {
    type: "conversation.message.agent",
    conversationId,
    tenantId,
    timestamp: new Date(),
    data,
  };
}

/**
 * Create an error event
 */
export function createErrorEvent(
  conversationId: string,
  tenantId: string,
  data: { error: string; code?: string; fatal: boolean }
): ConversationEvent {
  return {
    type: "conversation.error",
    conversationId,
    tenantId,
    timestamp: new Date(),
    data,
  };
}

// ============================================================================
// GLOBAL EVENT EMITTER
// ============================================================================

/**
 * Global conversation event emitter
 * Extensions and clients can subscribe to conversation events
 */
export const globalConversationEvents = new ConversationEventEmitter();

// ============================================================================
// ANALYTICS HELPERS
// ============================================================================

/**
 * Simple analytics collector that aggregates events
 */
export class ConversationAnalytics {
  private events: ConversationEvent[] = [];
  private maxEvents = 1000;
  
  constructor(eventEmitter: ConversationEventEmitter) {
    // Subscribe to all events
    eventEmitter.onAll((event) => {
      this.events.push(event);
      
      // Keep only last N events
      if (this.events.length > this.maxEvents) {
        this.events.shift();
      }
    });
  }
  
  /**
   * Get events for a conversation
   */
  getConversationEvents(conversationId: string): ConversationEvent[] {
    return this.events.filter(e => e.conversationId === conversationId);
  }
  
  /**
   * Get events by type
   */
  getEventsByType(type: ConversationEventType): ConversationEvent[] {
    return this.events.filter(e => e.type === type);
  }
  
  /**
   * Get tool call statistics
   */
  getToolStats(): Record<string, { calls: number; successRate: number; avgDuration: number }> {
    const toolCalls = this.getEventsByType("conversation.tool.called") as ConversationEvent<ToolCallEventData>[];
    const toolCompletions = this.getEventsByType("conversation.tool.completed") as ConversationEvent<ToolCompletedEventData>[];
    
    const stats: Record<string, { calls: number; successes: number; totalDuration: number }> = {};
    
    toolCalls.forEach(event => {
      const toolId = event.data.toolId;
      if (!stats[toolId]) {
        stats[toolId] = { calls: 0, successes: 0, totalDuration: 0 };
      }
      stats[toolId].calls++;
    });
    
    toolCompletions.forEach(event => {
      const toolId = event.data.toolId;
      if (stats[toolId]) {
        if (event.data.success) {
          stats[toolId].successes++;
        }
        stats[toolId].totalDuration += event.data.durationMs;
      }
    });
    
    return Object.fromEntries(
      Object.entries(stats).map(([toolId, data]) => [
        toolId,
        {
          calls: data.calls,
          successRate: data.calls > 0 ? data.successes / data.calls : 0,
          avgDuration: data.calls > 0 ? data.totalDuration / data.calls : 0,
        },
      ])
    );
  }
  
  /**
   * Get conversation count by tenant
   */
  getConversationsByTenant(): Record<string, number> {
    const started = this.getEventsByType("conversation.started");
    const counts: Record<string, Set<string>> = {};
    
    started.forEach(event => {
      if (!counts[event.tenantId]) {
        counts[event.tenantId] = new Set();
      }
      counts[event.tenantId].add(event.conversationId);
    });
    
    return Object.fromEntries(
      Object.entries(counts).map(([tenantId, conversations]) => [
        tenantId,
        conversations.size,
      ])
    );
  }
  
  /**
   * Clear all stored events
   */
  clear(): void {
    this.events = [];
  }
}
