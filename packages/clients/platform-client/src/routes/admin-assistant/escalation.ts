/**
 * Admin Assistant - Unified Escalation Manager
 * 
 * Handles escalation across ALL channels (voice, SMS, WhatsApp).
 * Provides: notification dispatch, unified queue, resolution tracking.
 * 
 * NOTIFICATION METHODS:
 * - SMS: Send alert to escalation phone number via Twilio
 * - Dashboard: Real-time polling (already working)
 * - Webhook: POST to configurable URL for external integrations
 * 
 * COMPLIANCE: Kenya DPA 2019 - client owns all data
 */

import { randomUUID } from "crypto";

// ============================================================================
// TYPES
// ============================================================================

export interface EscalationEntry {
  id: string;
  channel: "voice" | "sms" | "whatsapp" | "email";
  conversationId: string;
  contactPhone?: string;
  contactEmail?: string;
  contactName?: string;
  reason: string;
  urgency: "low" | "medium" | "high";
  department?: string;
  lastMessage: string;
  status: "waiting" | "assigned" | "resolved";
  assignedTo?: string;
  createdAt: Date;
  resolvedAt?: Date;
  metadata?: Record<string, string>;
}

export interface EscalationNotifyConfig {
  /** Phone number to receive SMS alerts (Twilio) */
  smsAlertPhone?: string;
  /** Webhook URL for external notification (Slack, Teams, etc.) */
  webhookUrl?: string;
  /** Whether notifications are enabled */
  enabled: boolean;
}

// ============================================================================
// UNIFIED ESCALATION QUEUE
// ============================================================================

/** Cross-channel escalation queue */
const unifiedQueue: Map<string, EscalationEntry> = new Map();

/** Notification config (loaded from platform config on startup) */
let notifyConfig: EscalationNotifyConfig = {
  enabled: true,
  smsAlertPhone: process.env.ESCALATION_PHONE || undefined,
  webhookUrl: process.env.ESCALATION_WEBHOOK_URL || undefined,
};

// ============================================================================
// ESCALATION API
// ============================================================================

/**
 * Add a conversation to the escalation queue and dispatch notifications.
 */
export async function escalate(params: {
  channel: EscalationEntry["channel"];
  conversationId: string;
  contactPhone?: string;
  contactEmail?: string;
  contactName?: string;
  reason: string;
  urgency?: EscalationEntry["urgency"];
  department?: string;
  lastMessage: string;
  metadata?: Record<string, string>;
}): Promise<EscalationEntry> {
  const entry: EscalationEntry = {
    id: randomUUID(),
    channel: params.channel,
    conversationId: params.conversationId,
    contactPhone: params.contactPhone,
    contactEmail: params.contactEmail,
    contactName: params.contactName,
    reason: params.reason,
    urgency: params.urgency || "medium",
    department: params.department,
    lastMessage: params.lastMessage,
    status: "waiting",
    createdAt: new Date(),
    metadata: params.metadata,
  };

  unifiedQueue.set(entry.id, entry);

  console.log(`[Escalation] 🚨 New ${params.channel} escalation`, {
    id: entry.id,
    contact: params.contactPhone || params.contactEmail,
    reason: params.reason,
    urgency: entry.urgency,
    queueSize: unifiedQueue.size,
  });

  // Dispatch notifications in background (don't block response)
  dispatchNotifications(entry).catch((err) =>
    console.error("[Escalation] Notification dispatch error:", err)
  );

  return entry;
}

/**
 * Resolve an escalation (after human agent handles it).
 */
export function resolveEscalation(
  escalationId: string,
  agentId?: string
): EscalationEntry | null {
  const entry = unifiedQueue.get(escalationId);
  if (!entry) return null;

  entry.status = "resolved";
  entry.resolvedAt = new Date();
  entry.assignedTo = agentId;
  unifiedQueue.delete(escalationId);

  console.log(`[Escalation] ✅ Resolved ${entry.channel} escalation`, {
    id: escalationId,
    phone: entry.contactPhone,
    resolvedBy: agentId,
    waitTimeMs: entry.resolvedAt.getTime() - entry.createdAt.getTime(),
  });

  return entry;
}

/**
 * Find escalation by conversation ID (used when agent replies).
 */
export function findByConversationId(conversationId: string): EscalationEntry | null {
  for (const entry of unifiedQueue.values()) {
    if (entry.conversationId === conversationId) return entry;
  }
  return null;
}

/**
 * Get the unified escalation queue, optionally filtered by channel.
 */
export function getQueue(channel?: EscalationEntry["channel"]): EscalationEntry[] {
  const all = Array.from(unifiedQueue.values());
  const filtered = channel ? all.filter((e) => e.channel === channel) : all;
  return filtered.sort((a, b) => {
    // High urgency first, then by time
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/**
 * Get queue stats.
 */
export function getQueueStats() {
  const all = Array.from(unifiedQueue.values());
  return {
    total: all.length,
    byChannel: {
      voice: all.filter((e) => e.channel === "voice").length,
      sms: all.filter((e) => e.channel === "sms").length,
      whatsapp: all.filter((e) => e.channel === "whatsapp").length,
      email: all.filter((e) => e.channel === "email").length,
    },
    byUrgency: {
      high: all.filter((e) => e.urgency === "high").length,
      medium: all.filter((e) => e.urgency === "medium").length,
      low: all.filter((e) => e.urgency === "low").length,
    },
    oldestWaitMinutes: all.length > 0
      ? Math.round((Date.now() - Math.min(...all.map((e) => e.createdAt.getTime()))) / 60000)
      : 0,
  };
}

/**
 * Update notification config (called from admin config).
 */
export function updateNotifyConfig(config: Partial<EscalationNotifyConfig>) {
  notifyConfig = { ...notifyConfig, ...config };
  console.log("[Escalation] Notification config updated", {
    smsAlertPhone: notifyConfig.smsAlertPhone ? "***" + notifyConfig.smsAlertPhone.slice(-4) : "none",
    webhookUrl: notifyConfig.webhookUrl ? "configured" : "none",
    enabled: notifyConfig.enabled,
  });
}

// ============================================================================
// NOTIFICATION DISPATCH
// ============================================================================

async function dispatchNotifications(entry: EscalationEntry): Promise<void> {
  if (!notifyConfig.enabled) return;

  const promises: Promise<void>[] = [];

  // SMS notification to escalation phone
  if (notifyConfig.smsAlertPhone) {
    promises.push(sendSmsAlert(entry));
  }

  // Webhook notification (Slack, Teams, custom)
  if (notifyConfig.webhookUrl) {
    promises.push(sendWebhookAlert(entry));
  }

  await Promise.allSettled(promises);
}

async function sendSmsAlert(entry: EscalationEntry): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber || !notifyConfig.smsAlertPhone) {
    console.warn("[Escalation] SMS alert skipped - Twilio not configured");
    return;
  }

  const channelEmoji = { voice: "📞", sms: "💬", whatsapp: "📱", email: "📧" }[entry.channel];
  const urgencyEmoji = { high: "🔴", medium: "🟡", low: "🟢" }[entry.urgency];

  const body = [
    `${urgencyEmoji} ${channelEmoji} ESCALATION`,
    `Channel: ${entry.channel.toUpperCase()}`,
    `From: ${entry.contactName || entry.contactPhone || entry.contactEmail}`,
    `Reason: ${entry.reason}`,
    `Message: "${entry.lastMessage.substring(0, 80)}"`,
    `Queue: ${unifiedQueue.size} waiting`,
  ].join("\n");

  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: notifyConfig.smsAlertPhone,
          From: fromNumber,
          Body: body,
        }),
      }
    );
    if (resp.ok) {
      console.log(`[Escalation] SMS alert sent to ${notifyConfig.smsAlertPhone.slice(-4)}`);
    } else {
      console.error(`[Escalation] SMS alert failed: ${resp.status}`);
    }
  } catch (err) {
    console.error("[Escalation] SMS alert error:", err);
  }
}

async function sendWebhookAlert(entry: EscalationEntry): Promise<void> {
  if (!notifyConfig.webhookUrl) return;

  try {
    const resp = await fetch(notifyConfig.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "escalation",
        channel: entry.channel,
        urgency: entry.urgency,
        contact: {
          phone: entry.contactPhone,
          name: entry.contactName,
        },
        reason: entry.reason,
        lastMessage: entry.lastMessage,
        department: entry.department,
        queuePosition: unifiedQueue.size,
        timestamp: entry.createdAt.toISOString(),
      }),
    });
    if (resp.ok) {
      console.log("[Escalation] Webhook alert sent");
    } else {
      console.error(`[Escalation] Webhook alert failed: ${resp.status}`);
    }
  } catch (err) {
    console.error("[Escalation] Webhook alert error:", err);
  }
}

console.log("[Escalation] Unified escalation manager initialized");
