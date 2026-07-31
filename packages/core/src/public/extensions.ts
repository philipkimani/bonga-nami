/**
 * EXTENSION CONTRACT — V2 (TENANT-AWARE)
 * 
 * This file defines what extensions are ALLOWED to do.
 * Once published, this contract must never break.
 * 
 * V2 CHANGES:
 * - TenantContext is now REQUIRED
 * - requestId is always present for tracing
 * - clientId is now an alias for tenantId (backward compat)
 */

import type { TenantContext } from "./tenant.js";

export interface ExtensionContext {
  /**
   * REQUIRED: Tenant context for multi-tenant isolation.
   * This must be present on all extension calls.
   * @since v3.0.0
   */
  readonly tenant: TenantContext;

  /**
   * @deprecated Use tenant.tenantId instead
   * Kept for backward compatibility with V1 extensions
   */
  readonly clientId: string;
  
  /**
   * Session ID for conversation state
   */
  readonly sessionId?: string;

  /**
   * Request ID for distributed tracing
   * @since v3.0.0
   */
  readonly requestId: string;
  
  /**
   * Intent emitted by one extension for another to handle.
   * Example: ecommerce emits "payments.initiate", payments extension handles it.
   * This enables clean separation between domains.
   * This field is mutable to allow extensions to set intents.
   */
  intent?: {
    type: string;
    [key: string]: any;
  };

  /**
   * Response object that extensions can populate.
   * The client reads this after beforeResponse() completes.
   */
  response?: {
    message?: string;
    attachments?: {
      type: 'image' | 'file' | 'link';
      url: string;
      alt?: string;
      title?: string;
    }[];
    details?: string;
    upsells?: {
      id: string;
      title: string;
      description: string;
      price: { amount: number; currency: string };
      reason: string;
      image?: { url: string; alt?: string };
      action: { type: "add_to_cart"; productId: string };
    }[];
  };

  /**
   * Upsell suggestions emitted by the upsell extension.
   * Domain extensions can render these in their responses.
   */
  upsell?: {
    suggestions: {
      id: string;
      title: string;
      description: string;
      price: { amount: number; currency: string };
      reason: string;
      image?: { url: string; alt?: string };
      action: { type: "add_to_cart"; productId: string };
    }[];
  };

  /**
   * Cart state for cross-extension communication.
   * Domain extensions should populate this after cart operations.
   */
  cart?: {
    items: {
      item: {
        id: string;
        title: string;
        price: { amount: number; currency: string };
        metadata?: Record<string, unknown>;
      };
      quantity: number;
    }[];
    total: { amount: number; currency: string };
  };
}

/**
 * Helper to create an ExtensionContext from TenantContext.
 * Use this in route handlers after tenant middleware.
 */
export function createExtensionContext(
  tenant: TenantContext,
  sessionId?: string
): ExtensionContext {
  return {
    tenant,
    clientId: tenant.tenantId, // backward compat
    sessionId: sessionId ?? tenant.sessionId,
    requestId: tenant.requestId,
  };
}

export interface ChatbotExtensionV1 {
  /**
   * Called once when the engine starts
   */
  onInitialize?(config: unknown): Promise<void> | void;

  /**
   * Called before a response is generated
   */
  beforeResponse?(
    input: string,
    context: ExtensionContext
  ): Promise<void> | void;

  /**
   * Called after a response is generated
   */
  afterResponse?(
    output: string,
    context: ExtensionContext
  ): Promise<void> | void;

  /**
   * Called when the engine shuts down
   */
  onShutdown?(): Promise<void> | void;
}
