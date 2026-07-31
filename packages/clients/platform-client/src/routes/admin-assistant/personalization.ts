/**
 * ElevenLabs Personalization Webhook
 * 
 * Called by ElevenLabs at the start of every conversation (voice, WhatsApp, web)
 * to fetch customer context for personalization.
 * 
 * This is the SINGLE endpoint that powers all channel personalization:
 * - Inbound phone calls: ElevenLabs sends caller_id, call_sid
 * - WhatsApp conversations: ElevenLabs sends phone number
 * - Outbound calls: ElevenLabs sends customer_phone_number
 * 
 * Returns:
 * - dynamic_variables: injected into agent's prompt as {{variable_name}}
 * - conversation_config_override: override agent settings per-customer
 * 
 * @see https://elevenlabs.io/docs/conversational-ai/phone-calls/outbound-calls#setting-up-a-dynamic-data-webhook
 * 
 * COMPLIANCE: Kenya DPA 2019 - all data stays in client's own instance
 */

import express from "express";

export const personalizationRouter = express.Router();

// ============================================================================
// TYPES
// ============================================================================

interface PersonalizationRequest {
  // Common fields
  conversation_id?: string;
  agent_id?: string;
  
  // Phone call fields
  caller_id?: string;       // Customer's phone number (inbound)
  called_number?: string;    // Your Twilio number
  call_sid?: string;         // Twilio call SID
  
  // WhatsApp fields  
  phone_number?: string;     // Customer's WhatsApp number
  
  // Outbound fields
  customer_phone_number?: string;
  
  // Dynamic data from conversation initiation
  dynamic_variables?: Record<string, string>;
}

interface PersonalizationResponse {
  dynamic_variables?: Record<string, string>;
  conversation_config_override?: {
    agent?: {
      first_message?: string;
      language?: string;
      prompt?: {
        prompt?: string;
      };
    };
    tts?: {
      voice_id?: string;
    };
  };
}

// ============================================================================
// CUSTOMER LOOKUP
// In production: Query Prisma Contact model
// ============================================================================

async function lookupContact(phoneNumber: string): Promise<{
  id: string;
  name: string;
  language: string;
  tags: string[];
  metadata: Record<string, string>;
  totalConversations: number;
  preferredChannel: string;
} | null> {
  // TODO: Replace with Prisma query:
  // const contact = await prisma.contact.findFirst({
  //   where: { phone: phoneNumber },
  // });
  
  // For now, return null (no personalization)
  // The agent will use default greeting
  console.log(`[Personalization] Looking up contact: ${phoneNumber}`);
  return null;
}

// ============================================================================
// PERSONALIZATION WEBHOOK
// ============================================================================

/**
 * POST /webhooks/elevenlabs/personalization
 * 
 * ElevenLabs calls this before starting a conversation.
 * Must respond within 5 seconds or ElevenLabs proceeds without personalization.
 */
personalizationRouter.post("/", async (req: any, res: any) => {
  try {
    const request: PersonalizationRequest = req.body;
    
    // Determine the customer's phone number from any field
    const phoneNumber = request.caller_id 
      || request.phone_number 
      || request.customer_phone_number
      || request.dynamic_variables?.phone_number
      || "";
    
    const channel = request.call_sid ? "phone" 
      : request.dynamic_variables?.channel || "unknown";

    console.log("[Personalization] Webhook called", {
      conversationId: request.conversation_id,
      agentId: request.agent_id,
      phoneNumber: phoneNumber ? `${phoneNumber.substring(0, 7)}***` : "none",
      channel,
    });

    // Look up customer by phone number
    const contact = await lookupContact(phoneNumber);

    // Build response
    const response: PersonalizationResponse = {
      dynamic_variables: {
        // Always provide these defaults
        customer_name: contact?.name || "valued customer",
        customer_phone: phoneNumber,
        channel: channel,
        conversation_start: new Date().toISOString(),
        
        // Contact-specific data (if found)
        ...(contact ? {
          customer_id: contact.id,
          language_preference: contact.language,
          total_conversations: String(contact.totalConversations),
          customer_tags: contact.tags.join(", "),
          preferred_channel: contact.preferredChannel || channel,
          ...contact.metadata,
        } : {}),

        // Pass through any existing dynamic variables from outbound calls
        ...(request.dynamic_variables || {}),
      },
    };

    // Override first message if we know the customer
    if (contact?.name) {
      response.conversation_config_override = {
        agent: {
          first_message: `Hello ${contact.name}! Thank you for reaching out. How can I help you today?`,
          ...(contact.language !== "en" ? { language: contact.language } : {}),
        },
      };
    }

    console.log("[Personalization] Responding with", {
      hasContact: !!contact,
      variableCount: Object.keys(response.dynamic_variables || {}).length,
      hasOverride: !!response.conversation_config_override,
    });

    res.json(response);

  } catch (error) {
    console.error("[Personalization] Webhook error:", error);
    // Return empty response — conversation proceeds without personalization
    // NEVER block a conversation due to webhook errors
    res.json({});
  }
});

/**
 * GET /webhooks/elevenlabs/personalization
 * 
 * Health check for the personalization webhook.
 * Useful for verifying the endpoint is reachable from ElevenLabs.
 */
personalizationRouter.get("/", (_req: any, res: any) => {
  res.json({
    status: "ok",
    service: "elevenlabs-personalization-webhook",
    timestamp: new Date().toISOString(),
    message: "POST to this endpoint with conversation data for personalization",
  });
});

console.log("[Personalization] ElevenLabs personalization webhook configured");
