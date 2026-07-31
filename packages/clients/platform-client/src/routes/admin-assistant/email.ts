/**
 * Admin Assistant - Email Route Handler (SendGrid)
 *
 * Inbound via SendGrid Inbound Parse, outbound via SendGrid Mail Send API.
 * AI responses powered by the SAME ElevenLabs agent as web/WhatsApp/SMS/Voice.
 * COMPLIANCE: Kenya DPA 2019 - client owns all data.
 */

import { createVerify, createPublicKey, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Verify a SendGrid Signed Event Webhook request.
 * Signature is ECDSA (P-256/SHA-256) over `timestamp + rawBody`.
 * `publicKeyBase64` is the base64 DER (SPKI) verification key from the SendGrid Console.
 */
export function verifyEventWebhookSignature(
  publicKeyBase64: string,
  rawBody: string | Buffer,
  signatureB64: string,
  timestamp: string,
): boolean {
  if (!publicKeyBase64 || !signatureB64 || !timestamp) return false;
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyBase64, "base64"),
      format: "der",
      type: "spki",
    });
    const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const payload = Buffer.concat([Buffer.from(timestamp), bodyBuf]);
    const verify = createVerify("sha256");
    verify.update(payload);
    verify.end();
    return verify.verify(key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/** Timing-safe secret comparison. False when `expected` is empty. */
export function secretMatches(provided: string, expected: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(provided || "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Bare, lowercased address from a From header: '"J" <J@X.com>' -> 'j@x.com'. */
export function parseFromEmail(fromHeader: string): string {
  if (!fromHeader) return "";
  const angle = fromHeader.match(/<([^>]+)>/);
  const raw = (angle ? angle[1] : fromHeader).trim();
  return raw.toLowerCase();
}

/** Prefix "Re: " unless the subject already starts with it (case-insensitive). */
export function buildReplySubject(subject: string): string {
  const s = (subject || "").trim();
  if (!s) return "Re: (no subject)";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/** Extract the Message-ID value (with angle brackets) from raw header text. */
export function extractMessageId(rawHeaders: string): string | undefined {
  const m = (rawHeaders || "").match(/^message-id:\s*(<[^>]+>)/im);
  return m ? m[1] : undefined;
}

/** RFC threading headers for the reply, or {} when no parent message id. */
export function buildThreadHeaders(inReplyToMessageId?: string): Record<string, string> {
  if (!inReplyToMessageId) return {};
  return { "In-Reply-To": inReplyToMessageId, References: inReplyToMessageId };
}

import express from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { TextConversationManager } from "@platform/voice-extension";
import { escalate, findByConversationId, resolveEscalation, getQueue } from "./escalation.js";
import { getPlatformConfig } from "../admin-config.js";

// ---------------------------------------------------------------------------
// Types + in-memory stores (mirrors sms.ts) // ponytail: restart-volatile
// ---------------------------------------------------------------------------

export interface EmailMessage {
  id: string;
  conversationId: string;
  channel: "email";
  direction: "inbound" | "outbound";
  sender: "customer" | "ai" | "human";
  content: string;
  subject?: string;
  sgMessageId?: string;
  status: "received" | "queued" | "delivered" | "bounce" | "dropped" | "failed";
  createdAt: Date;
}

interface EmailConversation {
  id: string;
  contactEmail: string;
  status: "active" | "escalated" | "completed" | "pending";
  startedAt: Date;
  aiHandledCount: number;
}

const emailConversations = new Map<string, EmailConversation>(); // key: contactEmail
const emailHistory = new Map<string, EmailMessage[]>(); // key: conversationId
const seenEventIds = new Set<string>(); // Event Webhook dedup (sg_event_id)

// ---------------------------------------------------------------------------
// SendGrid Mail Send (fetch, no SDK). Returns 202 on success.
// ---------------------------------------------------------------------------

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  threadHeaders?: Record<string, string>;
}): Promise<{ status: number }> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn("[Email] SENDGRID_API_KEY not set - reply not sent (mock 202)");
    return { status: 202 };
  }
  const body = {
    personalizations: [
      {
        to: [{ email: opts.to }],
        ...(opts.threadHeaders && Object.keys(opts.threadHeaders).length
          ? { headers: opts.threadHeaders }
          : {}),
      },
    ],
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || "",
      name: process.env.SENDGRID_FROM_NAME || "",
    },
    subject: opts.subject,
    content: [{ type: "text/plain", value: opts.text }],
  };
  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (resp.status !== 202) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`SendGrid send failed: ${resp.status} ${detail.slice(0, 200)}`);
  }
  return { status: resp.status };
}

// ---------------------------------------------------------------------------
// Escalation check (identical policy to sms.ts)
// ---------------------------------------------------------------------------

function checkForEscalation(msg: string, count: number): { shouldEscalate: boolean; reason: string } {
  const escalationConfig = getPlatformConfig().escalation;
  const lower = (msg || "").toLowerCase();
  const keywords = escalationConfig?.keywords || ["speak to human", "talk to agent", "manager", "complaint"];
  for (const phrase of keywords) {
    if (lower.includes(phrase.toLowerCase())) return { shouldEscalate: true, reason: phrase };
  }
  const threshold = escalationConfig?.messageThreshold ?? 10;
  if (threshold > 0 && count > threshold) return { shouldEscalate: true, reason: "Long conversation" };
  return { shouldEscalate: false, reason: "" };
}

// ---------------------------------------------------------------------------
// Inbound orchestration (pure of transport/network via injected deps)
// ---------------------------------------------------------------------------

export interface InboundDeps {
  getAiResponse: (email: string, text: string, history: EmailMessage[]) => Promise<string>;
  sendReply: (to: string, subject: string, text: string, threadHeaders: Record<string, string>) => Promise<void>;
}

export async function processInbound(
  fields: { from: string; subject: string; text: string; headers?: string },
  deps: InboundDeps,
): Promise<{ conversationId: string; replyText: string; escalated: boolean }> {
  const email = parseFromEmail(fields.from);
  const threadHeaders = buildThreadHeaders(extractMessageId(fields.headers || ""));
  const replySubject = buildReplySubject(fields.subject);

  let conversation = emailConversations.get(email);
  if (!conversation || conversation.status === "completed") {
    conversation = {
      id: randomUUID(),
      contactEmail: email,
      status: "active",
      startedAt: new Date(),
      aiHandledCount: 0,
    };
    emailConversations.set(email, conversation);
    emailHistory.set(conversation.id, []);
  }

  const history = emailHistory.get(conversation.id) || [];
  history.push({
    id: randomUUID(),
    conversationId: conversation.id,
    channel: "email",
    direction: "inbound",
    sender: "customer",
    content: fields.text || "",
    subject: fields.subject,
    status: "received",
    createdAt: new Date(),
  });
  emailHistory.set(conversation.id, history);

  const esc = checkForEscalation(fields.text, history.length);
  if (esc.shouldEscalate) {
    await escalate({
      channel: "email",
      conversationId: conversation.id,
      contactEmail: email,
      reason: esc.reason,
      lastMessage: fields.text || "",
      urgency: esc.reason === "complaint" ? "high" : "medium",
    });
    conversation.status = "escalated";
    emailConversations.set(email, conversation);
    const ack = "Thanks for reaching out - I'm connecting you with a team member who will reply shortly.";
    await deps.sendReply(email, replySubject, ack, threadHeaders);
    return { conversationId: conversation.id, replyText: ack, escalated: true };
  }

  const replyText = await deps.getAiResponse(email, fields.text || "", history);
  history.push({
    id: randomUUID(),
    conversationId: conversation.id,
    channel: "email",
    direction: "outbound",
    sender: "ai",
    content: replyText,
    subject: replySubject,
    status: "queued",
    createdAt: new Date(),
  });
  emailHistory.set(conversation.id, history);
  conversation.aiHandledCount++;
  emailConversations.set(email, conversation);

  await deps.sendReply(email, replySubject, replyText, threadHeaders);
  return { conversationId: conversation.id, replyText, escalated: false };
}

// ---------------------------------------------------------------------------
// ElevenLabs conversation manager (same agent as SMS/WhatsApp/Voice)
// ---------------------------------------------------------------------------

let emailConversationManager: TextConversationManager | null = null;
function getEmailConversationManager(): TextConversationManager | null {
  if (emailConversationManager) return emailConversationManager;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!agentId || !apiKey) {
    console.warn("[Email] ElevenLabs not configured - using fallback responses");
    return null;
  }
  const timeoutMs = parseInt(process.env.EMAIL_SESSION_TIMEOUT_MS || "3600000", 10); // 1h
  emailConversationManager = new TextConversationManager({ agentId, apiKey }, timeoutMs);
  console.log("[Email] ElevenLabs conversation manager initialized");
  return emailConversationManager;
}

async function generateAiResponse(email: string, msg: string): Promise<string> {
  try {
    const manager = getEmailConversationManager();
    if (manager) {
      return await manager.sendMessage(email, msg, { user_id: email, channel: "email" });
    }
    return "Thanks for your email - how can I help you today?";
  } catch (error) {
    console.error("[Email] AI response error:", error);
    return "I apologize, I'm having trouble right now. Please reply and I'll try again.";
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const emailRouter = express.Router();
const upload = multer(); // memory storage; parses multipart fields into req.body

// Inbound Parse webhook. Secret path segment + advisory SPF check.
emailRouter.post("/inbound/:secret", upload.any(), async (req: any, res: any) => {
  if (!secretMatches(req.params.secret, process.env.EMAIL_INBOUND_SECRET || "")) {
    return res.sendStatus(403);
  }
  try {
    const spf = String(req.body.SPF || req.body.spf || "").toLowerCase();
    if (spf && !spf.includes("pass")) {
      console.warn("[Email] Inbound SPF not pass:", spf, "from", req.body.from);
    }
    await processInbound(
      {
        from: req.body.from || "",
        subject: req.body.subject || "",
        text: req.body.text || "",
        headers: req.body.headers || "",
      },
      {
        getAiResponse: (email, text) => generateAiResponse(email, text),
        sendReply: async (to, subject, text, threadHeaders) => {
          await sendEmail({ to, subject, text, threadHeaders });
        },
      },
    );
    res.sendStatus(200);
  } catch (error) {
    console.error("[Email] Inbound error:", error);
    res.sendStatus(200); // 200 so SendGrid does not retry-storm; error is logged
  }
});

// Event Webhook (delivery/bounce). ECDSA-verified. Batched array. Dedup by sg_event_id.
emailRouter.post("/status", express.json(), async (req: any, res: any) => {
  const pubKey = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY || "";
  if (pubKey) {
    const sig = req.get("X-Twilio-Email-Event-Webhook-Signature") || "";
    const ts = req.get("X-Twilio-Email-Event-Webhook-Timestamp") || "";
    const raw = req.rawBody ?? JSON.stringify(req.body);
    if (!verifyEventWebhookSignature(pubKey, raw, sig, ts)) {
      return res.sendStatus(403);
    }
  }
  const events = Array.isArray(req.body) ? req.body : [];
  for (const ev of events) {
    if (ev.sg_event_id && seenEventIds.has(ev.sg_event_id)) continue;
    if (ev.sg_event_id) seenEventIds.add(ev.sg_event_id);
    for (const [, msgs] of emailHistory) {
      const m = msgs.find((x) => x.sgMessageId && ev.sg_message_id?.startsWith(x.sgMessageId));
      if (m && ["delivered", "bounce", "dropped"].includes(ev.event)) {
        m.status = ev.event;
        break;
      }
    }
  }
  res.sendStatus(200);
});

// Outbound single send (agent/human initiated)
emailRouter.post("/send", async (req: any, res: any) => {
  const { to, subject, text } = req.body || {};
  if (!to || !subject || !text) return res.status(400).json({ error: "Missing to, subject, or text" });
  try {
    const result = await sendEmail({ to, subject, text });
    res.json({ success: true, status: result.status });
  } catch (error) {
    res.status(500).json({ error: "Failed to send email" });
  }
});

// Bulk send (one personalization per recipient; <=1000/call)
emailRouter.post("/bulk", async (req: any, res: any) => {
  const { recipients, subject, text } = req.body || {};
  if (!recipients?.length || !subject || !text) return res.status(400).json({ error: "Missing data" });
  const results = await Promise.allSettled(
    recipients.slice(0, 1000).map((r: { email: string }) => sendEmail({ to: r.email, subject, text })),
  );
  res.json({ success: true, sent: results.filter((r) => r.status === "fulfilled").length });
});

// Admin: escalation queue reply
emailRouter.post("/queue/:conversationId/reply", async (req: any, res: any) => {
  const { conversationId } = req.params;
  const { message, agentId } = req.body || {};
  if (!message) return res.status(400).json({ error: "Missing message" });
  const esc = findByConversationId(conversationId);
  if (!esc || !esc.contactEmail) return res.status(404).json({ error: "Not found" });
  try {
    await sendEmail({ to: esc.contactEmail, subject: "Re: your message", text: message });
    const conv = emailConversations.get(esc.contactEmail);
    if (conv) conv.status = "active";
    resolveEscalation(esc.id, agentId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Reply failed" });
  }
});

// Admin: read endpoints
emailRouter.get("/conversations", (_req: any, res: any) => {
  const convos = Array.from(emailConversations.values()).sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
  );
  res.json({ conversations: convos });
});
emailRouter.get("/conversations/:id/messages", (req: any, res: any) => {
  const msgs = emailHistory.get(req.params.id);
  if (!msgs) return res.status(404).json({ error: "Not found" });
  res.json({ messages: msgs });
});
emailRouter.get("/queue", (_req: any, res: any) => {
  const queue = getQueue("email");
  res.json({ queue, count: queue.length });
});
emailRouter.get("/status", (_req: any, res: any) => {
  res.json({
    status: "ok",
    sendgrid: {
      apiKeySet: !!process.env.SENDGRID_API_KEY,
      fromEmail: process.env.SENDGRID_FROM_EMAIL || null,
      inboundSecretSet: !!process.env.EMAIL_INBOUND_SECRET,
      webhookKeySet: !!process.env.SENDGRID_WEBHOOK_PUBLIC_KEY,
    },
    elevenlabs: { configured: !!(process.env.ELEVENLABS_AGENT_ID && process.env.ELEVENLABS_API_KEY) },
    managerActive: !!emailConversationManager,
  });
});

console.log("[Admin Assistant] Email routes configured with SendGrid + ElevenLabs");
