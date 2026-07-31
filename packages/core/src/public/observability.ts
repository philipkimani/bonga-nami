/**
 * OBSERVABILITY — PUBLIC CONTRACT
 * 
 * Events emitted for logging/analytics (not billing).
 */

export interface PlatformEvent {
  readonly clientId: string;
  readonly eventType: string;
  readonly action: string;
  readonly timestamp: number;
  readonly sessionId?: string;
  readonly metadata?: Record<string, unknown>;
}
