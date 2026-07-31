/**
 * WhatsApp Extension - Types
 */

export interface WhatsAppConfig {
  /**
   * WhatsApp Business Account phone number ID
   */
  phoneNumberId: string;

  /**
   * WhatsApp Business API access token
   */
  accessToken: string;

  /**
   * Webhook verification token (for initial setup)
   */
  verifyToken?: string;
}

export interface WhatsAppMessage {
  from: string;
  text: string;
  messageId: string;
  timestamp: number;
}

export interface WhatsAppOutboundMessage {
  to: string;
  text: string;
}

export interface TenantMapping {
  tenantId: string;
  phoneNumberId: string;
  accessToken: string;
}

/**
 * Tenant information with capabilities
 */
export interface Tenant {
  tenantId: string;
  capabilities: string[];
}

/**
 * Capability definition for WhatsApp
 */
export const WhatsAppCapability = {
  key: "whatsapp",
  name: "WhatsApp Channel",
  description: "Access AI assistant via WhatsApp",
  metered: true,
} as const;
