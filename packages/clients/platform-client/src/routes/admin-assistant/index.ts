/**
 * Admin Assistant - Main Router
 * 
 * Aggregates all Admin Assistant routes:
 * - /calls    - Voice calls (Twilio + ElevenLabs)
 * - /sms      - SMS messaging (Twilio + ElevenLabs)
 * - /whatsapp - WhatsApp (ElevenLabs native integration)
 * 
 * COMPLIANCE: Kenya DPA 2019 - single-tenant deployment
 */

import express from "express";
import { callsRouter } from "./calls.js";
import { smsRouter } from "./sms.js";
import { whatsappRouter } from "./whatsapp.js";
import { personalizationRouter } from "./personalization.js";
import { getQueue, getQueueStats } from "./escalation.js";

export const adminAssistantRouter = express.Router();

// Mount sub-routers
adminAssistantRouter.use("/calls", callsRouter);
adminAssistantRouter.use("/sms", smsRouter);
adminAssistantRouter.use("/whatsapp", whatsappRouter);

// Export personalization router separately (mounted at /webhooks/elevenlabs/personalization)
export { personalizationRouter };

// Dashboard summary endpoint
adminAssistantRouter.get("/dashboard", async (req: any, res: any) => {
  try {
    const queueStats = getQueueStats();
    
    res.json({
      summary: {
        totalConversationsToday: 0,
        activeConversations: 0,
        escalatedCount: queueStats.total,
        aiHandledPercentage: 0,
      },
      channels: {
        calls: {
          enabled: true,
          totalToday: 0,
          inProgress: 0,
          avgDuration: 0,
        },
        sms: {
          enabled: true,
          totalToday: 0,
          unread: 0,
          avgResponseTime: 0,
        },
        whatsapp: {
          enabled: true,
          status: "connected",
          mode: "elevenlabs_native",
          message: "Managed via ElevenLabs native integration",
          totalToday: 0,
          unread: 0,
          avgResponseTime: 0,
        },
      },
      escalationQueue: {
        calls: queueStats.byChannel.voice,
        sms: queueStats.byChannel.sms,
        whatsapp: queueStats.byChannel.whatsapp,
        total: queueStats.total,
        byUrgency: queueStats.byUrgency,
        oldestWaitMinutes: queueStats.oldestWaitMinutes,
      },
    });
  } catch (error) {
    console.error("[Admin Assistant] Dashboard error:", error);
    res.status(500).json({ error: "Failed to get dashboard data" });
  }
});

// Unified escalation queue (cross-channel)
adminAssistantRouter.get("/escalations", async (req: any, res: any) => {
  try {
    const { channel } = req.query;
    const queue = getQueue(channel as any);
    const stats = getQueueStats();
    res.json({ queue, stats });
  } catch (error) {
    res.status(500).json({ error: "Failed to get escalations" });
  }
});

// Configuration endpoint
adminAssistantRouter.get("/config", async (req: any, res: any) => {
  try {
    // Return non-sensitive configuration status
    res.json({
      twilio: {
        configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        phoneNumber: process.env.TWILIO_PHONE_NUMBER ? "Configured" : "Not configured",
        whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER ? "Configured" : "Not configured",
      },
      elevenlabs: {
        configured: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID),
        agentConfigured: !!process.env.ELEVENLABS_AGENT_ID,
      },
      features: {
        calls: process.env.ENABLE_ADMIN_ASSISTANT_CALLS === "true",
        sms: process.env.ENABLE_ADMIN_ASSISTANT_SMS === "true",
        whatsapp: process.env.ENABLE_ADMIN_ASSISTANT_WHATSAPP === "true",
      },
    });
  } catch (error) {
    console.error("[Admin Assistant] Config error:", error);
    res.status(500).json({ error: "Failed to get config" });
  }
});

console.log("[Admin Assistant] Main router configured (calls + sms + whatsapp + escalation)");

export { callsRouter } from "./calls.js";
export { smsRouter } from "./sms.js";
export { whatsappRouter } from "./whatsapp.js";
export { escalate, resolveEscalation, findByConversationId, getQueue, getQueueStats } from "./escalation.js";
