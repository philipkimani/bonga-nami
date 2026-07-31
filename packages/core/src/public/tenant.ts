/**
 * TENANT CONTEXT — SECURITY BOUNDARY
 * 
 * Every request must carry tenant context.
 * It is impossible to call core logic without this.
 * 
 * @since v3.0.0
 */

/**
 * Role-based access control for tenant users
 */
export type TenantRole = "platform_admin" | "client_admin" | "client_user";

/**
 * Tenant context that MUST be present on every request.
 * This is injected at the API boundary and passed through all layers.
 */
export interface TenantContext {
  /** Unique identifier for the tenant */
  readonly tenantId: string;
  
  /** Role of the current user */
  readonly role: TenantRole;
  
  /** Request correlation ID for tracing */
  readonly requestId: string;
  
  /** Session ID for conversation state */
  readonly sessionId?: string;
}

/**
 * Per-tenant integration configuration.
 * All API keys are encrypted at rest.
 */
export interface TenantIntegrations {
  elevenlabs?: {
    /** Encrypted API key - NEVER log this */
    apiKeyEncrypted: string;
    /** Default voice for TTS */
    defaultVoice: string;
    /** ElevenLabs region */
    region: string;
  };
  // Future integrations (payments, etc.)
}

/**
 * Full tenant record including integrations.
 * This is what's stored in the tenant registry.
 */
export interface TenantRecord {
  readonly tenantId: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly integrations: TenantIntegrations;
  readonly settings: {
    rateLimit: {
      requestsPerMinute: number;
      requestsPerDay: number;
    };
    features: {
      voice: boolean;
      admin: boolean;
      knowledgeBase: boolean;
    };
  };
}

/**
 * Assertion helper - ensures tenant context is valid.
 * Throws if tenant context is missing or invalid.
 */
export function assertTenantContext(
  ctx: TenantContext | undefined | null,
  action?: string
): asserts ctx is TenantContext {
  if (!ctx) {
    throw new Error(
      `Tenant context required${action ? ` for action "${action}"` : ""}`
    );
  }
  if (!ctx.tenantId) {
    throw new Error("Tenant ID is required");
  }
  if (!ctx.requestId) {
    throw new Error("Request ID is required for tracing");
  }
}

/**
 * Create a minimal tenant context for testing.
 * NOT for production use.
 */
export function createTestTenantContext(
  tenantId: string,
  overrides?: Partial<TenantContext>
): TenantContext {
  return {
    tenantId,
    role: "client_user",
    requestId: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...overrides
  };
}
