/**
 * Admin Assistant - SMS Route Handler
 * 
 * Handles inbound/outbound SMS via Twilio.
 * AI responses powered by ElevenLabs Conversational AI.
 * Same AI agent that powers web widget and WhatsApp.
 * 
 * CARRIERS: Safaricom, Airtel Kenya (via Twilio +254 numbers)
 * COMPLIANCE: Kenya DPA 2019 - client owns all data
 */

import express from "express";
import { createHmac, randomUUID } from "crypto";
import { TextConversationManager } from "@platform/voice-extension";
import { escalate, findByConversationId, resolveEscalation, getQueue } from "./escalation.js";
import { getPlatformConfig } from "../admin-config.js";

// Config from environment
const twilioConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || "",
  authToken: process.env.TWILIO_AUTH_TOKEN || "",
  phoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
  webhookBaseUrl: process.env.TWILIO_WEBHOOK_BASE_URL || "",
};

const clientConfig = {
  customerId: process.env.CLIENT_ID || "demo",
};

// ============================================================================
// ELEVENLABS CONVERSATION MANAGER
// ============================================================================

/**
 * Conversation manager for SMS users.
 * Uses the SAME ElevenLabs agent as web widget and WhatsApp.
 * Sessions persist to maintain conversation context.
 */
let smsConversationManager: TextConversationManager | null = null;

function getSmsConversationManager(): TextConversationManager | null {
  if (smsConversationManager) return smsConversationManager;
  
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!agentId || !apiKey) {
    console.warn('[SMS] ElevenLabs not configured - using fallback responses');
    return null;
  }
  
  // Session timeout: 10 minutes for SMS
  const timeoutMs = parseInt(process.env.SMS_SESSION_TIMEOUT_MS || '600000', 10);
  
  smsConversationManager = new TextConversationManager(
    { agentId, apiKey },
    timeoutMs
  );
  
  console.log('[SMS] ElevenLabs conversation manager initialized');
  return smsConversationManager;
}

// Types
interface TwilioSmsWebhook {
  MessageSid: string;
  From: string;
  To: string;
  Body?: string;
  MessageStatus?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

interface SmsMessage {
  id: string;
  conversationId: string;
  channel: "sms";
  direction: "inbound" | "outbound";
  sender: "customer" | "ai" | "human";
  content: string;
  twilioSid?: string;
  smsStatus: "queued" | "sent" | "delivered" | "failed" | "undelivered";
  errorCode?: string;
  errorMessage?: string;
  createdAt: Date;
}

interface Conversation {
  id: string;
  contactId: string;
  channel: "sms" | "whatsapp" | "voice";
  status: ConversationStatus;
  startedAt: Date;
  endedAt?: Date;
  aiHandledCount: number;
  escalatedTo?: string;
  escalatedAt?: Date;
  escalationReason?: string;
}

type ConversationStatus = "active" | "escalated" | "completed" | "pending";

export const smsRouter = express.Router();

// In-memory stores
const smsConversations: Map<string, Conversation> = new Map();
const messageHistory: Map<string, SmsMessage[]> = new Map();

// Twilio signature validation
function validateTwilioSignature(req: any): boolean {
  if (process.env.NODE_ENV === "development" && process.env.SKIP_TWILIO_VALIDATION === "true") {
    return true;
  }
  const signature = req.get("X-Twilio-Signature");
  if (!signature || !twilioConfig.authToken) return false;
  
  const url = `${twilioConfig.webhookBaseUrl}${req.originalUrl}`;
  const params = Object.keys(req.body).sort().reduce((acc: string, key: string) => acc + key + req.body[key], "");
  const expectedSignature = createHmac("sha1", twilioConfig.authToken).update(url + params).digest("base64");
  return signature === expectedSignature;
}

function twilioAuth(req: any, res: any, next: Function) {
  if (!validateTwilioSignature(req)) {
    return res.status(403).send("Forbidden");
  }
  next();
}

// Inbound SMS webhook
smsRouter.post("/inbound", twilioAuth, async (req: any, res: any) => {
  try {
    const webhook = req.body as TwilioSmsWebhook;
    console.log("[SMS] Inbound", { from: webhook.From, body: webhook.Body?.substring(0, 50) });

    let conversation = smsConversations.get(webhook.From);
    if (!conversation || conversation.status === "completed") {
      conversation = {
        id: randomUUID(),
        contactId: webhook.From,
        channel: "sms",
        status: "active",
        startedAt: new Date(),
        aiHandledCount: 0,
      };
      smsConversations.set(webhook.From, conversation);
      messageHistory.set(conversation.id, []);
    }

    const history = messageHistory.get(conversation.id) || [];
    history.push({
      id: randomUUID(),
      conversationId: conversation.id,
      channel: "sms",
      direction: "inbound",
      sender: "customer",
      content: webhook.Body || "",
      twilioSid: webhook.MessageSid,
      smsStatus: "delivered",
      createdAt: new Date(),
    });
    messageHistory.set(conversation.id, history);

    const escalationCheck = checkForEscalation(webhook.Body, history.length);
    if (escalationCheck.shouldEscalate) {
      return handleSmsEscalation(res, conversation, webhook, escalationCheck.reason);
    }

    const aiResponse = await generateAiResponse(webhook.Body || "", history, webhook.From);
    history.push({
      id: randomUUID(),
      conversationId: conversation.id,
      channel: "sms",
      direction: "outbound",
      sender: "ai",
      content: aiResponse,
      smsStatus: "queued",
      createdAt: new Date(),
    });
    messageHistory.set(conversation.id, history);
    conversation.aiHandledCount++;
    smsConversations.set(webhook.From, conversation);

    res.type("text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(aiResponse)}</Message></Response>`);
  } catch (error) {
    console.error("[SMS] Inbound error:", error);
    res.type("text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Sorry, please try again.</Message></Response>`);
  }
});

// Status webhook
smsRouter.post("/status", twilioAuth, async (req: any, res: any) => {
  try {
    const webhook = req.body as TwilioSmsWebhook;
    for (const [, messages] of messageHistory) {
      const msg = messages.find(m => m.twilioSid === webhook.MessageSid);
      if (msg) {
        msg.smsStatus = webhook.MessageStatus as SmsMessage["smsStatus"];
        break;
      }
    }
    res.sendStatus(200);
  } catch (error) {
    res.sendStatus(500);
  }
});

// Send SMS
smsRouter.post("/send", async (req: any, res: any) => {
  try {
    const { to, message, conversationId } = req.body;
    if (!to || !message) return res.status(400).json({ error: "Missing to or message" });
    if (!to.match(/^\+\d{10,15}$/)) return res.status(400).json({ error: "Invalid phone format" });

    const result = await sendTwilioSms(to, message);
    if (conversationId) {
      const messages = messageHistory.get(conversationId) || [];
      messages.push({
        id: randomUUID(), conversationId, channel: "sms", direction: "outbound",
        sender: "human", content: message, twilioSid: result.sid, smsStatus: "queued", createdAt: new Date(),
      });
      messageHistory.set(conversationId, messages);
    }
    res.json({ success: true, messageSid: result.sid });
  } catch (error) {
    res.status(500).json({ error: "Failed to send SMS" });
  }
});

// Bulk SMS
smsRouter.post("/bulk", async (req: any, res: any) => {
  try {
    const { recipients, messageTemplate, campaignName } = req.body;
    if (!recipients?.length || !messageTemplate) return res.status(400).json({ error: "Missing data" });

    const results = await Promise.allSettled(
      recipients.map(async (r: { phone: string; variables?: Record<string, string> }) => {
        let msg = messageTemplate;
        if (r.variables) {
          for (const [k, v] of Object.entries(r.variables)) msg = msg.replace(`{{${k}}}`, v);
        }
        return sendTwilioSms(r.phone, msg);
      })
    );
    res.json({ success: true, campaignName, successful: results.filter(r => r.status === "fulfilled").length });
  } catch (error) {
    res.status(500).json({ error: "Bulk send failed" });
  }
});

// Admin endpoints
smsRouter.get("/conversations", async (req: any, res: any) => {
  try {
    const { status, limit = 50 } = req.query;
    let convos = Array.from(smsConversations.values());
    if (status) convos = convos.filter(c => c.status === status);
    convos.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    res.json({ conversations: convos.slice(0, Number(limit)) });
  } catch (error) {
    res.status(500).json({ error: "Failed" });
  }
});

smsRouter.get("/conversations/:id/messages", async (req: any, res: any) => {
  const messages = messageHistory.get(req.params.id);
  if (!messages) return res.status(404).json({ error: "Not found" });
  res.json({ messages });
});

smsRouter.get("/queue", async (req: any, res: any) => {
  const queue = getQueue("sms");
  res.json({ queue, count: queue.length });
});

smsRouter.post("/queue/:conversationId/reply", async (req: any, res: any) => {
  try {
    const { conversationId } = req.params;
    const { message, agentId } = req.body;
    if (!message) return res.status(400).json({ error: "Missing message" });

    const esc = findByConversationId(conversationId);
    if (!esc) return res.status(404).json({ error: "Not found" });

    const result = await sendTwilioSms(esc.contactPhone, message);
    const conv = smsConversations.get(esc.contactPhone);
    if (conv) { conv.escalatedTo = agentId; conv.status = "active"; }

    const msgs = messageHistory.get(conversationId) || [];
    msgs.push({ id: randomUUID(), conversationId, channel: "sms", direction: "outbound", sender: "human", content: message, twilioSid: result.sid, smsStatus: "queued", createdAt: new Date() });
    messageHistory.set(conversationId, msgs);
    resolveEscalation(esc.id, agentId);
    res.json({ success: true, messageSid: result.sid });
  } catch (error) {
    res.status(500).json({ error: "Reply failed" });
  }
});

// Helpers
async function generateAiResponse(msg: string, history: SmsMessage[], phone: string): Promise<string> {
  try {
    const manager = getSmsConversationManager();
    
    // If ElevenLabs is configured, use the AI agent
    if (manager) {
      const response = await manager.sendMessage(phone, msg, {
        user_id: phone,
        channel: 'sms',
      });
      console.log(`[SMS] ElevenLabs response for ${phone}: ${response.substring(0, 50)}...`);
      return response;
    }
    
    // Fallback responses if ElevenLabs not configured
    const customer = await lookupCustomer(phone);
    const lower = msg.toLowerCase();
    if (lower.includes("hello") || lower.includes("hi")) return customer ? `Hello ${customer.name}! 👋` : "Hello! 👋 How can I help?";
    if (lower.includes("help")) return "I can help with orders, products, and support. What do you need?";
    if (lower.includes("thank")) return "You're welcome! 😊";
    return "Thanks for your message! How can I assist you today?";
  } catch (error) {
    console.error('[SMS] AI response error:', error);
    return "I apologize, I'm having trouble right now. Please try again.";
  }
}

function checkForEscalation(msg: string, count: number) {
  const config = getPlatformConfig();
  const escalationConfig = config.escalation;
  const lower = (msg || "").toLowerCase();
  
  // Check keywords from config
  const keywords = escalationConfig?.keywords || ["speak to human", "talk to agent", "manager", "complaint"];
  for (const phrase of keywords) {
    if (lower.includes(phrase.toLowerCase())) return { shouldEscalate: true, reason: phrase };
  }
  
  // Check message count threshold from config (0 = disabled)
  const threshold = escalationConfig?.messageThreshold ?? 10;
  if (threshold > 0 && count > threshold) return { shouldEscalate: true, reason: "Long conversation" };
  
  return { shouldEscalate: false, reason: "" };
}

function handleSmsEscalation(res: any, conv: Conversation, webhook: TwilioSmsWebhook, reason: string) {
  escalate({
    channel: "sms",
    conversationId: conv.id,
    contactPhone: webhook.From,
    reason,
    lastMessage: webhook.Body || "",
    urgency: reason === "complaint" ? "high" : "medium",
  });
  conv.status = "escalated"; conv.escalatedAt = new Date(); conv.escalationReason = reason;
  smsConversations.set(webhook.From, conv);
  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Connecting you with a team member. 🙏</Message></Response>`);
}

async function sendTwilioSms(to: string, body: string): Promise<{ sid: string }> {
  if (!twilioConfig.accountSid) return { sid: `MOCK_${randomUUID()}` };
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.accountSid}/Messages.json`, {
    method: "POST",
    headers: { "Authorization": `Basic ${Buffer.from(`${twilioConfig.accountSid}:${twilioConfig.authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: twilioConfig.phoneNumber, Body: body }),
  });
  if (!resp.ok) throw new Error(`Twilio error: ${resp.status}`);
  const data: any = await resp.json();
  return { sid: data.sid };
}

async function lookupCustomer(phone: string) {
  if (phone === "+254712345678") return { id: "CUST-001", name: "John Kamau" };
  return null;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Status endpoint
smsRouter.get("/status", (req: any, res: any) => {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  res.json({
    status: 'ok',
    elevenlabs: {
      configured: !!(agentId && apiKey),
      agentId: agentId ? `${agentId.substring(0, 8)}...` : null,
    },
    twilio: {
      accountSidSet: !!twilioConfig.accountSid,
      phoneNumber: twilioConfig.phoneNumber || null,
    },
    managerActive: !!smsConversationManager,
  });
});

console.log("[Admin Assistant] SMS routes configured with ElevenLabs");
