/**
 * Admin Assistant - WhatsApp Route Handler
 * 
 * Manages WhatsApp conversations via ElevenLabs native integration.
 * ElevenLabs handles the WhatsApp Business API connection natively —
 * our platform provides: admin UI, conversation history, outbound messaging,
 * contact lookup (personalization), and campaign management.
 * 
 * ARCHITECTURE:
 * - Inbound: Customer messages WABA → ElevenLabs handles AI response natively
 * - Outbound text: Admin sends via ElevenLabs WhatsApp tools API
 * - Outbound voice: Admin initiates WhatsApp voice call via ElevenLabs API
 * - Personalization: ElevenLabs pre-call webhook → our server returns contact context
 * 
 * COMPLIANCE: Kenya DPA 2019 - client owns all data
 */

import express from "express";
import { randomUUID } from "crypto";
import { escalate, findByConversationId, resolveEscalation, getQueue } from "./escalation.js";

// ============================================================================
// Configuration (from environment / platform settings)
// ============================================================================

const elevenLabsConfig = {
  apiKey: process.env.ELEVENLABS_API_KEY || "",
  agentId: process.env.ELEVENLABS_AGENT_ID || "",
  phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID || "",
};

export const whatsappRouter = express.Router();

// ============================================================================
// TYPES
// ============================================================================

interface WhatsAppConversation {
  id: string;
  contactPhone: string;
  contactName?: string;
  lastMessage: string;
  lastMessageAt: Date;
  unreadCount: number;
  status: "active" | "escalated" | "completed";
  channel: "whatsapp";
  aiHandled: boolean;
  messages: WhatsAppMessage[];
}

interface WhatsAppMessage {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "ai" | "human";
  messageType: "text" | "voice" | "image" | "template";
  content: string;
  status: "sent" | "delivered" | "read" | "failed";
  createdAt: Date;
}

// ============================================================================
// IN-MEMORY STORE (Replace with Prisma in production)
// ============================================================================

const conversations: Map<string, WhatsAppConversation> = new Map();

// ============================================================================
// ELEVENLABS WHATSAPP API HELPERS
// ============================================================================

/**
 * Send a WhatsApp message via ElevenLabs API.
 * Uses the agent's WhatsApp tools capability.
 * @see https://elevenlabs.io/docs/conversational-ai/guides/conversational-ai-whatsapp
 */
async function sendWhatsAppViaElevenLabs(
  to: string,
  message: string,
  agentId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const targetAgentId = agentId || elevenLabsConfig.agentId;
  
  if (!elevenLabsConfig.apiKey || !targetAgentId) {
    console.warn("[WhatsApp] ElevenLabs not configured");
    return { success: false, error: "ElevenLabs not configured" };
  }

  try {
    // Use ElevenLabs Conversational AI to send outbound WhatsApp
    // This triggers the agent to initiate a conversation on WhatsApp
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/create-phone-call`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsConfig.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_id: targetAgentId,
          agent_phone_number_id: elevenLabsConfig.phoneNumberId,
          customer_phone_number: to,
          // For text-only WhatsApp, we pass the initial message
          conversation_initiation_client_data: {
            dynamic_variables: {
              outbound_message: message,
              channel: "whatsapp",
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[WhatsApp] ElevenLabs send error:", errorText);
      return { success: false, error: `ElevenLabs error: ${response.status}` };
    }

    const data: any = await response.json();
    return { 
      success: true, 
      messageId: data.conversation_id || randomUUID(),
    };
  } catch (error) {
    console.error("[WhatsApp] Send error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Initiate a WhatsApp voice call via ElevenLabs.
 * The agent calls the customer on WhatsApp with voice AI.
 */
async function initiateWhatsAppVoiceCall(
  to: string,
  dynamicVariables?: Record<string, string>,
  agentId?: string
): Promise<{ success: boolean; callId?: string; error?: string }> {
  const targetAgentId = agentId || elevenLabsConfig.agentId;
  
  if (!elevenLabsConfig.apiKey || !targetAgentId) {
    return { success: false, error: "ElevenLabs not configured" };
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/create-phone-call`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsConfig.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_id: targetAgentId,
          agent_phone_number_id: elevenLabsConfig.phoneNumberId,
          customer_phone_number: to,
          conversation_initiation_client_data: {
            dynamic_variables: {
              ...dynamicVariables,
              channel: "whatsapp_voice",
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[WhatsApp] Voice call error:", errorText);
      return { success: false, error: `ElevenLabs error: ${response.status}` };
    }

    const data: any = await response.json();
    return { 
      success: true, 
      callId: data.conversation_id,
    };
  } catch (error) {
    console.error("[WhatsApp] Voice call error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Fetch conversation history from ElevenLabs API.
 */
async function fetchElevenLabsConversations(
  agentId?: string,
  pageSize: number = 30
): Promise<any[]> {
  const targetAgentId = agentId || elevenLabsConfig.agentId;
  
  if (!elevenLabsConfig.apiKey || !targetAgentId) {
    return [];
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${targetAgentId}&page_size=${pageSize}`,
      {
        headers: {
          "xi-api-key": elevenLabsConfig.apiKey,
        },
      }
    );

    if (!response.ok) {
      console.error("[WhatsApp] Fetch conversations error:", response.status);
      return [];
    }

    const data: any = await response.json();
    return data.conversations || [];
  } catch (error) {
    console.error("[WhatsApp] Fetch conversations error:", error);
    return [];
  }
}

/**
 * Get a single conversation's details from ElevenLabs.
 */
async function fetchElevenLabsConversation(conversationId: string): Promise<any | null> {
  if (!elevenLabsConfig.apiKey) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
      {
        headers: {
          "xi-api-key": elevenLabsConfig.apiKey,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("[WhatsApp] Fetch conversation error:", error);
    return null;
  }
}

// ============================================================================
// SEND MESSAGE API
// Admin console sends outbound WhatsApp messages
// ============================================================================

/**
 * POST /api/admin-assistant/whatsapp/send
 * 
 * Send an outbound WhatsApp message to a customer.
 */
whatsappRouter.post("/send", async (req: any, res: any) => {
  try {
    const { to, message, conversationId } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: "Missing 'to' or 'message'" });
    }

    // Validate E.164 format
    if (!to.match(/^\+\d{10,15}$/)) {
      return res.status(400).json({
        error: "Invalid phone number. Use E.164: +254712345678",
      });
    }

    console.log("[WhatsApp] Sending message", { to, preview: message.substring(0, 50) });

    const result = await sendWhatsAppViaElevenLabs(to, message);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Track in local store
    const convId = conversationId || randomUUID();
    let conversation = conversations.get(to);
    if (!conversation) {
      conversation = {
        id: convId,
        contactPhone: to,
        lastMessage: message,
        lastMessageAt: new Date(),
        unreadCount: 0,
        status: "active",
        channel: "whatsapp",
        aiHandled: false,
        messages: [],
      };
    }
    
    conversation.messages.push({
      id: randomUUID(),
      conversationId: convId,
      direction: "outbound",
      sender: "human",
      messageType: "text",
      content: message,
      status: "sent",
      createdAt: new Date(),
    });
    conversation.lastMessage = message;
    conversation.lastMessageAt = new Date();
    conversations.set(to, conversation);

    res.json({
      success: true,
      messageId: result.messageId,
      conversationId: convId,
    });
  } catch (error) {
    console.error("[WhatsApp] Send error:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ============================================================================
// OUTBOUND VOICE CALL
// Initiate WhatsApp voice call
// ============================================================================

/**
 * POST /api/admin-assistant/whatsapp/voice-call
 * 
 * Initiate a WhatsApp voice call to a customer.
 */
whatsappRouter.post("/voice-call", async (req: any, res: any) => {
  try {
    const { to, dynamicVariables, agentId } = req.body;

    if (!to) {
      return res.status(400).json({ error: "Missing 'to' phone number" });
    }

    if (!to.match(/^\+\d{10,15}$/)) {
      return res.status(400).json({
        error: "Invalid phone number. Use E.164: +254712345678",
      });
    }

    console.log("[WhatsApp] Initiating voice call", { to });

    const result = await initiateWhatsAppVoiceCall(to, dynamicVariables, agentId);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      callId: result.callId,
      status: "initiated",
    });
  } catch (error) {
    console.error("[WhatsApp] Voice call error:", error);
    res.status(500).json({ error: "Failed to initiate voice call" });
  }
});

// ============================================================================
// BROADCAST (Template Messages)
// Send bulk WhatsApp messages using pre-approved templates
// ============================================================================

/**
 * POST /api/admin-assistant/whatsapp/broadcast
 * 
 * Send a template message to multiple recipients.
 */
whatsappRouter.post("/broadcast", async (req: any, res: any) => {
  try {
    const { recipients, message, templateName, campaignName } = req.body;

    if (!recipients?.length || !message) {
      return res.status(400).json({ error: "Missing recipients or message" });
    }

    console.log("[WhatsApp] Broadcast", {
      count: recipients.length,
      campaignName,
      templateName,
    });

    // Send to each recipient (with rate limiting)
    const results = await Promise.allSettled(
      recipients.map(async (r: { phone: string; variables?: Record<string, string> }, index: number) => {
        // Basic rate limiting: stagger messages
        await new Promise(resolve => setTimeout(resolve, index * 200));
        
        let personalizedMessage = message;
        if (r.variables) {
          for (const [key, value] of Object.entries(r.variables)) {
            personalizedMessage = personalizedMessage.replace(`{{${key}}}`, value);
          }
        }
        
        return sendWhatsAppViaElevenLabs(r.phone, personalizedMessage);
      })
    );

    const successful = results.filter(r => r.status === "fulfilled" && (r.value as any).success).length;
    const failed = results.length - successful;

    res.json({
      success: true,
      campaignName,
      totalRecipients: recipients.length,
      successful,
      failed,
      status: "completed",
    });
  } catch (error) {
    console.error("[WhatsApp] Broadcast error:", error);
    res.status(500).json({ error: "Broadcast failed" });
  }
});

// ============================================================================
// CONVERSATION MANAGEMENT
// ============================================================================

/**
 * GET /api/admin-assistant/whatsapp/conversations
 * 
 * List WhatsApp conversations (from local store + ElevenLabs API).
 */
whatsappRouter.get("/conversations", async (req: any, res: any) => {
  try {
    const { status, limit = 50 } = req.query;

    // Get conversations from ElevenLabs
    const elevenLabsConvos = await fetchElevenLabsConversations(undefined, Number(limit));

    // Merge with local store and filter WhatsApp-only
    let allConversations = Array.from(conversations.values());

    // Add ElevenLabs conversations that we don't have locally
    for (const elConvo of elevenLabsConvos) {
      // Filter for WhatsApp channel if possible
      const metadata = elConvo.metadata || {};
      if (metadata.channel === "whatsapp" || elConvo.conversation_initiation_client_data?.channel === "whatsapp") {
        const existing = allConversations.find(c => c.id === elConvo.conversation_id);
        if (!existing) {
          allConversations.push({
            id: elConvo.conversation_id,
            contactPhone: metadata.phone_number || elConvo.phone_number || "Unknown",
            contactName: metadata.customer_name,
            lastMessage: elConvo.last_message || "",
            lastMessageAt: new Date(elConvo.start_time_unix_secs * 1000),
            unreadCount: 0,
            status: elConvo.status === "done" ? "completed" : "active",
            channel: "whatsapp",
            aiHandled: true,
            messages: [],
          });
        }
      }
    }

    if (status) {
      allConversations = allConversations.filter(c => c.status === status);
    }

    allConversations.sort((a, b) => 
      b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
    );

    res.json({
      conversations: allConversations.slice(0, Number(limit)),
      total: allConversations.length,
    });
  } catch (error) {
    console.error("[WhatsApp] List conversations error:", error);
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

/**
 * GET /api/admin-assistant/whatsapp/conversations/:id
 * 
 * Get a specific conversation with full message history.
 */
whatsappRouter.get("/conversations/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;

    // Try local store first
    for (const [, conv] of conversations) {
      if (conv.id === id) {
        return res.json({ conversation: conv });
      }
    }

    // Try ElevenLabs API
    const elConvo = await fetchElevenLabsConversation(id);
    if (elConvo) {
      // Transform ElevenLabs conversation to our format
      const messages: WhatsAppMessage[] = (elConvo.transcript || []).map((t: any, i: number) => ({
        id: `${id}-${i}`,
        conversationId: id,
        direction: t.role === "user" ? "inbound" : "outbound",
        sender: t.role === "user" ? "customer" : "ai",
        messageType: "text",
        content: t.message || "",
        status: "delivered",
        createdAt: new Date(t.time_in_call_secs * 1000 + (elConvo.start_time_unix_secs || 0) * 1000),
      }));

      return res.json({
        conversation: {
          id: elConvo.conversation_id,
          contactPhone: elConvo.metadata?.phone_number || "Unknown",
          contactName: elConvo.metadata?.customer_name,
          lastMessage: messages[messages.length - 1]?.content || "",
          lastMessageAt: new Date(elConvo.start_time_unix_secs * 1000),
          unreadCount: 0,
          status: elConvo.status === "done" ? "completed" : "active",
          channel: "whatsapp",
          aiHandled: true,
          messages,
        },
      });
    }

    res.status(404).json({ error: "Conversation not found" });
  } catch (error) {
    console.error("[WhatsApp] Get conversation error:", error);
    res.status(500).json({ error: "Failed to get conversation" });
  }
});

// ============================================================================
// ESCALATION
// ============================================================================

/**
 * POST /api/admin-assistant/whatsapp/escalate
 * 
 * Trigger escalation for a WhatsApp conversation.
 * Can be called by:
 * - ElevenLabs server tool (AI decides to escalate)
 * - Admin UI ("Take Over" button)
 */
whatsappRouter.post("/escalate", async (req: any, res: any) => {
  try {
    const { conversation_id, phone_number, reason, urgency, department } = req.body;

    if (!conversation_id && !phone_number) {
      return res.status(400).json({ error: "Missing conversation_id or phone_number" });
    }

    const contactPhone = phone_number || "unknown";
    const convId = conversation_id || randomUUID();

    // Find or create conversation record
    let conv = conversations.get(contactPhone);
    if (conv) {
      conv.status = "escalated";
    }

    const entry = await escalate({
      channel: "whatsapp",
      conversationId: convId,
      contactPhone,
      contactName: conv?.contactName,
      reason: reason || "Customer requested human agent",
      urgency: urgency || "medium",
      department,
      lastMessage: conv?.lastMessage || "WhatsApp conversation escalated",
    });

    res.json({
      success: true,
      message: "Conversation queued for human agent",
      escalationId: entry.id,
      queuePosition: getQueue("whatsapp").length,
    });
  } catch (error) {
    console.error("[WhatsApp] Escalation error:", error);
    res.status(500).json({ error: "Escalation failed" });
  }
});

/**
 * GET /api/admin-assistant/whatsapp/queue
 * 
 * Get escalation queue (conversations waiting for human agent).
 */
whatsappRouter.get("/queue", async (req: any, res: any) => {
  try {
    const queue = getQueue("whatsapp");
    res.json({ queue, count: queue.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to get queue" });
  }
});

/**
 * POST /api/admin-assistant/whatsapp/queue/:conversationId/reply
 * 
 * Human agent replies to an escalated WhatsApp conversation.
 */
whatsappRouter.post("/queue/:conversationId/reply", async (req: any, res: any) => {
  try {
    const { conversationId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    const escalation = findByConversationId(conversationId);
    if (!escalation) {
      return res.status(404).json({ error: "Escalation not found" });
    }

    // Send reply via WhatsApp
    const result = await sendWhatsAppViaElevenLabs(escalation.contactPhone, message);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Resolve escalation
    resolveEscalation(escalation.id);

    // Update conversation
    const conv = conversations.get(escalation.contactPhone);
    if (conv) {
      conv.status = "active";
      conv.messages.push({
        id: randomUUID(),
        conversationId,
        direction: "outbound",
        sender: "human",
        messageType: "text",
        content: message,
        status: "sent",
        createdAt: new Date(),
      });
    }

    res.json({ success: true, messageId: result.messageId });
  } catch (error) {
    res.status(500).json({ error: "Reply failed" });
  }
});

// ============================================================================
// STATUS / HEALTH
// ============================================================================

/**
 * GET /api/admin-assistant/whatsapp/status
 * 
 * Check WhatsApp integration status.
 */
whatsappRouter.get("/status", (_req: any, res: any) => {
  const apiKey = elevenLabsConfig.apiKey;
  const agentId = elevenLabsConfig.agentId;
  const phoneNumberId = elevenLabsConfig.phoneNumberId;

  res.json({
    status: apiKey && agentId ? "connected" : "not_configured",
    elevenlabs: {
      configured: !!(apiKey && agentId),
      agentId: agentId ? `${agentId.substring(0, 8)}...` : null,
      phoneNumberId: phoneNumberId || null,
    },
    whatsapp: {
      enabled: !!(apiKey && agentId),
      mode: "elevenlabs_native",
    },
    activeConversations: conversations.size,
    escalationQueue: getQueue("whatsapp").length,
  });
});

console.log("[Admin Assistant] WhatsApp routes configured (ElevenLabs native)");
