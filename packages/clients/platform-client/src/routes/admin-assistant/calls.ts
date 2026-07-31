/**
 * Admin Assistant - Voice Calls Route Handler
 * 
 * Handles inbound/outbound voice calls via Twilio + ElevenLabs.
 * 
 * ARCHITECTURE:
 * - Inbound: Customer calls Twilio number → Twilio webhook → Connect to ElevenLabs AI
 * - Outbound: API trigger → ElevenLabs batch call or Twilio connect to AI
 * - Escalation: AI triggers transfer → Twilio conference/forward to human
 * 
 * CARRIERS: Safaricom, Airtel Kenya (via Twilio +254 numbers)
 * COMPLIANCE: Kenya DPA 2019 - client owns all data
 */

import express from "express";
import { escalate, getQueue, resolveEscalation, findByConversationId } from "./escalation.js";
import { createHmac, randomUUID } from "crypto";
import { getPlatformConfig } from "../admin-config.js";

// Config values from environment
const twilioConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || "",
  authToken: process.env.TWILIO_AUTH_TOKEN || "",
  phoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
  webhookBaseUrl: process.env.TWILIO_WEBHOOK_BASE_URL || "",
};

const elevenLabsConfig = {
  apiKey: process.env.ELEVENLABS_API_KEY || "",
  agentId: process.env.ELEVENLABS_AGENT_ID || "",
};

// Types
interface TwilioVoiceWebhook {
  CallSid: string;
  From: string;
  To: string;
  CallStatus: string;
  Direction?: string;
  CallerName?: string;
  CallDuration?: string;
  RecordingUrl?: string;
  RecordingSid?: string;
}

interface Call {
  id: string;
  conversationId: string;
  twilioCallSid: string;
  direction: "inbound" | "outbound";
  status: CallStatus;
  from: string;
  to: string;
  startedAt: Date;
  endedAt?: Date;
  duration?: number;
  durationSeconds?: number;
  recording_url?: string;
  recordingUrl?: string;
  recordingSid?: string;
  aiAgentId?: string;
  aiConnectedAt?: Date;
}

type CallStatus = "ringing" | "in-progress" | "completed" | "failed" | "escalated" | "no-answer" | "busy" | "ai-handling" | "on-hold" | "queued" | "canceled";

interface ConversationInitiationRequest {
  conversation_id: string;
  phone_number?: string;
  caller_id?: string;
}

interface ConversationInitiationResponse {
  dynamic_variables?: Record<string, string>;
  conversation_config_override?: {
    agent?: {
      first_message?: string;
    };
  };
}

export const callsRouter = express.Router();

// ============================================================================
// IN-MEMORY STORE (Replace with database in production)
// ============================================================================

const activeCalls: Map<string, Call> = new Map();

// ============================================================================
// TWILIO SIGNATURE VALIDATION
// ============================================================================

function validateTwilioSignature(req: any): boolean {
  if (process.env.NODE_ENV === "development" && process.env.SKIP_TWILIO_VALIDATION === "true") {
    return true;
  }
  
  const signature = req.get("X-Twilio-Signature");
  if (!signature || !twilioConfig.authToken) {
    return false;
  }
  
  // Build the full URL
  const url = `${twilioConfig.webhookBaseUrl}${req.originalUrl}`;
  
  // Sort and concatenate POST parameters
  const params = Object.keys(req.body)
    .sort()
    .reduce((acc: string, key: string) => acc + key + req.body[key], "");
  
  const expectedSignature = createHmac("sha1", twilioConfig.authToken)
    .update(url + params)
    .digest("base64");
  
  return signature === expectedSignature;
}

// Middleware for Twilio webhook validation
function twilioAuth(req: any, res: any, next: Function) {
  if (!validateTwilioSignature(req)) {
    console.warn("[Calls] Invalid Twilio signature", { path: req.path });
    return res.status(403).send("Forbidden");
  }
  next();
}

// ============================================================================
// INBOUND CALL WEBHOOK
// Twilio calls this when someone dials your +254 number
// ============================================================================

/**
 * POST /webhooks/admin-assistant/calls/inbound
 * 
 * Called by Twilio when an inbound call arrives.
 * Returns TwiML to connect the caller to ElevenLabs AI.
 */
callsRouter.post("/inbound", twilioAuth, async (req: any, res: any) => {
  try {
    const webhook = req.body as TwilioVoiceWebhook;
    console.log("[Calls] Inbound call", {
      callSid: webhook.CallSid,
      from: webhook.From,
      to: webhook.To,
    });

    // Create call record
    const call: Call = {
      id: randomUUID(),
      conversationId: randomUUID(),
      twilioCallSid: webhook.CallSid,
      direction: "inbound",
      status: "ringing",
      from: webhook.From,
      to: webhook.To,
      startedAt: new Date(),
    };
    activeCalls.set(webhook.CallSid, call);

    // Generate signed URL for ElevenLabs Conversational AI
    const signedUrl = await getElevenLabsSignedUrl(webhook.From);

    if (!signedUrl) {
      // Fallback: Play message and hang up
      res.type("text/xml");
      return res.send(`
        <?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="alice">
            We're sorry, our AI assistant is currently unavailable. 
            Please try again later or press 0 to speak with an agent.
          </Say>
          <Gather numDigits="1" action="/webhooks/admin-assistant/calls/fallback">
            <Pause length="5"/>
          </Gather>
          <Hangup/>
        </Response>
      `);
    }

    // Connect to ElevenLabs via WebSocket (Twilio Media Streams)
    // This uses Twilio's native ElevenLabs integration
    res.type("text/xml");
    res.send(`
      <?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Connect>
          <Stream url="${signedUrl}">
            <Parameter name="caller_phone" value="${webhook.From}"/>
            <Parameter name="call_sid" value="${webhook.CallSid}"/>
          </Stream>
        </Connect>
      </Response>
    `);

    // Update call status
    call.status = "ai-handling";
    call.aiAgentId = elevenLabsConfig.agentId;
    call.aiConnectedAt = new Date();
    activeCalls.set(webhook.CallSid, call);

  } catch (error) {
    console.error("[Calls] Inbound error:", error);
    res.type("text/xml");
    res.send(`
      <?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>We're experiencing technical difficulties. Please try again later.</Say>
        <Hangup/>
      </Response>
    `);
  }
});

// ============================================================================
// CALL STATUS WEBHOOK
// Twilio calls this with status updates (answered, completed, etc.)
// ============================================================================

/**
 * POST /webhooks/admin-assistant/calls/status
 * 
 * Called by Twilio for call status changes.
 */
callsRouter.post("/status", twilioAuth, async (req: any, res: any) => {
  try {
    const webhook = req.body as TwilioVoiceWebhook;
    const call = activeCalls.get(webhook.CallSid);

    if (!call) {
      console.warn("[Calls] Status for unknown call", { callSid: webhook.CallSid });
      return res.sendStatus(200);
    }

    console.log("[Calls] Status update", {
      callSid: webhook.CallSid,
      status: webhook.CallStatus,
      duration: webhook.CallDuration,
    });

    // Map Twilio status to our status
    const statusMap: Record<string, CallStatus> = {
      "queued": "queued",
      "ringing": "ringing",
      "in-progress": "in-progress",
      "completed": "completed",
      "busy": "busy",
      "failed": "failed",
      "no-answer": "no-answer",
      "canceled": "canceled",
    };

    call.status = statusMap[webhook.CallStatus] || call.status;

    if (webhook.CallStatus === "completed") {
      call.endedAt = new Date();
      call.durationSeconds = parseInt(webhook.CallDuration || "0", 10);
      
      if (webhook.RecordingUrl) {
        call.recordingUrl = webhook.RecordingUrl;
        call.recordingSid = webhook.RecordingSid;
      }
    }

    activeCalls.set(webhook.CallSid, call);
    res.sendStatus(200);

  } catch (error) {
    console.error("[Calls] Status error:", error);
    res.sendStatus(500);
  }
});

// ============================================================================
// HUMAN ESCALATION WEBHOOK
// Called when AI determines human intervention is needed
// ============================================================================

/**
 * POST /webhooks/admin-assistant/calls/escalate
 * 
 * Called by ElevenLabs (via server tool) when escalation is needed.
 */
callsRouter.post("/escalate", async (req: any, res: any) => {
  try {
    const { call_sid, reason, department, urgency } = req.body;
    
    console.log("[Calls] Escalation requested", {
      callSid: call_sid,
      reason,
      department,
      urgency,
    });

    const call = activeCalls.get(call_sid);
    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }

    // Add to unified escalation queue
    await escalate({
      channel: "voice",
      conversationId: call_sid,
      contactPhone: call.from || "unknown",
      reason: reason || "Customer requested human agent",
      urgency: urgency || "medium",
      department,
      lastMessage: "Voice call - requires live transfer",
      metadata: { callSid: call_sid },
    });

    // Update call status
    call.status = "on-hold";
    activeCalls.set(call_sid, call);

    // Attempt live call transfer via Twilio Conference if enabled
    const config = getPlatformConfig();
    const escalationConfig = config.escalation;
    
    if (escalationConfig?.enableCallTransfer && escalationConfig?.transferPhone) {
      try {
        await initiateCallTransfer(call_sid, escalationConfig.transferPhone);
        console.log("[Calls] ✅ Conference transfer initiated", { callSid: call_sid });
        
        return res.json({
          success: true,
          message: "Transferring call to human agent",
          transfer: true,
          transferPhone: escalationConfig.transferPhone.slice(-4),
        });
      } catch (transferErr) {
        console.error("[Calls] Conference transfer failed, call queued instead:", transferErr);
        // Fall through to queue response
      }
    }

    res.json({
      success: true,
      message: "Call queued for human agent",
      estimatedWait: "2 minutes",
      queuePosition: getQueue("voice").length,
    });

  } catch (error) {
    console.error("[Calls] Escalation error:", error);
    res.status(500).json({ error: "Escalation failed" });
  }
});

// ============================================================================
// TWILIO CONFERENCE CALL TRANSFER
// Redirects live call into a Conference room and dials the agent in
// ============================================================================

/**
 * POST /webhooks/admin-assistant/calls/conference-twiml
 * 
 * TwiML endpoint that Twilio loads when we redirect the caller into a Conference.
 * Query param: ?room=CONFERENCE_ROOM_NAME
 */
callsRouter.post("/conference-twiml", (req: any, res: any) => {
  const room = req.query.room || req.body.room || "escalation-room";
  
  console.log("[Calls] Conference TwiML requested", { room });
  
  // Put the caller into the conference with hold music while agent joins
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Please hold while we connect you to an agent.</Say>
  <Dial>
    <Conference 
      startConferenceOnEnter="true"
      endConferenceOnExit="true"
      waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical"
      statusCallback="${twilioConfig.webhookBaseUrl || ''}/webhooks/admin-assistant/calls/conference-status"
      statusCallbackEvent="start end join leave"
    >${room}</Conference>
  </Dial>
</Response>`;

  res.type("text/xml");
  res.send(twiml);
});

/**
 * POST /webhooks/admin-assistant/calls/conference-status
 * 
 * Tracks Conference events (join, leave, end).
 */
callsRouter.post("/conference-status", (req: any, res: any) => {
  const { ConferenceSid, StatusCallbackEvent, CallSid } = req.body;
  console.log("[Calls] Conference event", { ConferenceSid, event: StatusCallbackEvent, callSid: CallSid });
  res.sendStatus(200);
});

/**
 * Initiate a live call transfer via Twilio Conference.
 * 
 * 1. Redirect the existing caller's call into a Conference room
 * 2. Dial the agent/supervisor into the same Conference room
 * 
 * This bridges the customer and agent in real-time.
 */
async function initiateCallTransfer(callSid: string, transferPhone: string): Promise<void> {
  if (!twilioConfig.accountSid || !twilioConfig.authToken) {
    throw new Error("Twilio not configured — cannot transfer call");
  }

  const conferenceRoom = `escalation-${callSid.substring(0, 8)}`;
  const baseUrl = twilioConfig.webhookBaseUrl;
  
  if (!baseUrl) {
    throw new Error("TWILIO_WEBHOOK_BASE_URL not set — cannot generate Conference TwiML URL");
  }

  const auth = Buffer.from(`${twilioConfig.accountSid}:${twilioConfig.authToken}`).toString("base64");
  const apiBase = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.accountSid}`;

  // Step 1: Redirect the caller's live call to our Conference TwiML
  const redirectResp = await fetch(`${apiBase}/Calls/${callSid}.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      Url: `${baseUrl}/webhooks/admin-assistant/calls/conference-twiml?room=${conferenceRoom}`,
      Method: "POST",
    }),
  });

  if (!redirectResp.ok) {
    const errText = await redirectResp.text();
    throw new Error(`Twilio call redirect failed (${redirectResp.status}): ${errText}`);
  }

  console.log("[Calls] Caller redirected to conference", { callSid, room: conferenceRoom });

  // Step 2: Dial the agent into the same Conference room
  // Using TwiML `<Dial><Conference>` via the Calls create API with Twiml parameter
  const conferenceTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false">${conferenceRoom}</Conference></Dial></Response>`;

  const dialResp = await fetch(`${apiBase}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: transferPhone,
      From: twilioConfig.phoneNumber,
      Twiml: conferenceTwiml,
    }),
  });

  if (!dialResp.ok) {
    const errText = await dialResp.text();
    throw new Error(`Twilio outbound dial failed (${dialResp.status}): ${errText}`);
  }

  const dialData: any = await dialResp.json();
  console.log("[Calls] ✅ Agent dialed into conference", {
    room: conferenceRoom,
    agentCallSid: dialData.sid,
    transferPhone: transferPhone.slice(-4),
  });
}

// ============================================================================
// CONVERSATION INITIATION WEBHOOK
// ElevenLabs calls this to get customer context for personalization
// ============================================================================

/**
 * POST /webhooks/admin-assistant/calls/conversation-init
 * 
 * Called by ElevenLabs at the start of a conversation.
 * Returns customer data for personalization (dynamic variables).
 */
callsRouter.post("/conversation-init", async (req: any, res: any) => {
  try {
    const initRequest = req.body as ConversationInitiationRequest;
    
    console.log("[Calls] Conversation init", {
      conversationId: initRequest.conversation_id,
      phoneNumber: initRequest.phone_number,
    });

    // Look up customer by phone number
    // In production: Query your database
    const customerData = await lookupCustomer(initRequest.phone_number || "");

    const response: ConversationInitiationResponse = {
      dynamic_variables: {
        customer_name: customerData?.name || "valued customer",
        customer_id: customerData?.id || "",
        account_balance: customerData?.balance || "",
        last_order: customerData?.lastOrder || "",
        loyalty_tier: customerData?.loyaltyTier || "standard",
        language_preference: customerData?.language || "en",
      },
      conversation_config_override: customerData?.name ? {
        agent: {
          first_message: `Hello ${customerData.name}! Thank you for calling. How can I help you today?`,
        }
      } : undefined,
    };

    res.json(response);

  } catch (error) {
    console.error("[Calls] Conversation init error:", error);
    // Return empty response - conversation will proceed without personalization
    res.json({});
  }
});

// ============================================================================
// OUTBOUND CALL API
// Trigger outbound calls (single or batch)
// ============================================================================

/**
 * POST /api/admin-assistant/calls/outbound
 * 
 * Initiate an outbound call to a customer.
 */
callsRouter.post("/outbound", async (req: any, res: any) => {
  try {
    const { to, dynamicVariables, agentId } = req.body;

    if (!to) {
      return res.status(400).json({ error: "Missing 'to' phone number" });
    }

    // Validate phone number format (E.164)
    if (!to.match(/^\+\d{10,15}$/)) {
      return res.status(400).json({ 
        error: "Invalid phone number format. Use E.164: +254712345678" 
      });
    }

    console.log("[Calls] Outbound call requested", { to });

    // Use ElevenLabs batch calling API for outbound
    const result = await initiateOutboundCall(to, dynamicVariables, agentId);

    res.json({
      success: true,
      callId: result.callId,
      status: "initiated",
    });

  } catch (error) {
    console.error("[Calls] Outbound error:", error);
    res.status(500).json({ error: "Failed to initiate call" });
  }
});

/**
 * POST /api/admin-assistant/calls/batch
 * 
 * Initiate batch outbound calls (e.g., appointment reminders).
 */
callsRouter.post("/batch", async (req: any, res: any) => {
  try {
    const { recipients, campaignName, agentId, scheduledFor } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: "Missing or empty recipients array" });
    }

    console.log("[Calls] Batch call requested", { 
      count: recipients.length,
      campaignName,
      scheduledFor,
    });

    // Use ElevenLabs batch calling API
    const result = await initiateBatchCalls(recipients, campaignName, agentId, scheduledFor);

    res.json({
      success: true,
      campaignId: result.campaignId,
      recipientCount: recipients.length,
      status: scheduledFor ? "scheduled" : "processing",
    });

  } catch (error) {
    console.error("[Calls] Batch error:", error);
    res.status(500).json({ error: "Failed to initiate batch calls" });
  }
});

// ============================================================================
// ADMIN API - Call management
// ============================================================================

/**
 * GET /api/admin-assistant/calls
 * 
 * List recent calls with filtering.
 */
callsRouter.get("/", async (req: any, res: any) => {
  try {
    const { status, direction, limit = 50 } = req.query;
    
    let calls = Array.from(activeCalls.values());
    
    if (status) {
      calls = calls.filter(c => c.status === status);
    }
    if (direction) {
      calls = calls.filter(c => c.direction === direction);
    }
    
    calls.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    calls = calls.slice(0, Number(limit));

    res.json({ calls });

  } catch (error) {
    console.error("[Calls] List error:", error);
    res.status(500).json({ error: "Failed to list calls" });
  }
});

/**
 * GET /api/admin-assistant/calls/queue
 * 
 * Get escalation queue (calls waiting for human agent).
 */
callsRouter.get("/queue", async (req: any, res: any) => {
  try {
    const queue = getQueue("voice");
    res.json({ queue, count: queue.length });
  } catch (error) {
    console.error("[Calls] Queue error:", error);
    res.status(500).json({ error: "Failed to get queue" });
  }
});

/**
 * POST /api/admin-assistant/calls/queue/:escalationId/resolve
 * 
 * Resolve an escalated call (mark as handled by human agent).
 */
callsRouter.post("/queue/:escalationId/resolve", async (req: any, res: any) => {
  try {
    const { escalationId } = req.params;
    const { agentId } = req.body;

    const resolved = resolveEscalation(escalationId, agentId);
    if (!resolved) {
      return res.status(404).json({ error: "Escalation not found" });
    }

    // Update call status
    const callSid = resolved.metadata?.callSid || resolved.conversationId;
    const call = activeCalls.get(callSid);
    if (call) {
      call.status = "completed";
      activeCalls.set(callSid, call);
    }

    res.json({ success: true, resolved });
  } catch (error) {
    console.error("[Calls] Queue resolve error:", error);
    res.status(500).json({ error: "Failed to resolve" });
  }
});

/**
 * GET /api/admin-assistant/calls/:callSid
 * 
 * Get details of a specific call.
 */
callsRouter.get("/:callSid", async (req: any, res: any) => {
  try {
    const call = activeCalls.get(req.params.callSid);
    
    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }

    res.json({ call });

  } catch (error) {
    console.error("[Calls] Get error:", error);
    res.status(500).json({ error: "Failed to get call" });
  }
});

/**
 * GET /api/admin-assistant/calls/history/elevenlabs
 * 
 * Fetch call history from ElevenLabs Conversational AI API.
 * Returns conversations that were voice calls (phone channel).
 */
callsRouter.get("/history/elevenlabs", async (req: any, res: any) => {
  try {
    const { limit = 30 } = req.query;
    
    if (!elevenLabsConfig.apiKey || !elevenLabsConfig.agentId) {
      return res.json({ calls: [], message: "ElevenLabs not configured" });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${elevenLabsConfig.agentId}&page_size=${limit}`,
      {
        headers: { "xi-api-key": elevenLabsConfig.apiKey },
      }
    );

    if (!response.ok) {
      return res.status(500).json({ error: "Failed to fetch from ElevenLabs" });
    }

    const data: any = await response.json();
    
    // Filter for phone/voice conversations and transform
    const calls = (data.conversations || [])
      .filter((c: any) => {
        const meta = c.metadata || {};
        return meta.channel === "phone" || meta.channel === "voice" || c.phone_number;
      })
      .map((c: any) => ({
        id: c.conversation_id,
        from: c.phone_number || c.metadata?.caller_id || "Unknown",
        to: c.metadata?.called_number || elevenLabsConfig.agentId,
        direction: c.metadata?.direction || "inbound",
        status: c.status === "done" ? "completed" : c.status,
        startedAt: new Date(c.start_time_unix_secs * 1000).toISOString(),
        durationSeconds: c.call_duration_secs || 0,
        aiHandled: true,
        elevenLabsConversationId: c.conversation_id,
      }));

    res.json({ calls });
  } catch (error) {
    console.error("[Calls] History error:", error);
    res.status(500).json({ error: "Failed to fetch call history" });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get signed WebSocket URL for ElevenLabs Conversational AI
 */
async function getElevenLabsSignedUrl(callerPhone: string): Promise<string | null> {
  if (!elevenLabsConfig.apiKey || !elevenLabsConfig.agentId) {
    console.warn("[Calls] Missing ElevenLabs credentials");
    return null;
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${elevenLabsConfig.agentId}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": elevenLabsConfig.apiKey,
        },
      }
    );

    if (!response.ok) {
      console.error("[Calls] ElevenLabs signed URL error:", await response.text());
      return null;
    }

    const data: any = await response.json();
    return data.signed_url;

  } catch (error) {
    console.error("[Calls] Failed to get signed URL:", error);
    return null;
  }
}

/**
 * Look up customer by phone number (mock - replace with DB query)
 */
async function lookupCustomer(phoneNumber: string): Promise<{
  id: string;
  name: string;
  balance?: string;
  lastOrder?: string;
  loyaltyTier?: string;
  language?: string;
} | null> {
  // In production: Query your database
  // This is a mock for demo purposes
  
  if (phoneNumber === "+254712345678") {
    return {
      id: "CUST-001",
      name: "John Kamau",
      balance: "KES 15,000",
      lastOrder: "Order #12345 - iPhone Case",
      loyaltyTier: "Gold",
      language: "en",
    };
  }
  
  return null;
}

/**
 * Initiate single outbound call via ElevenLabs
 * @see https://elevenlabs.io/docs/conversational-ai/phone-calls/outbound-calls
 */
async function initiateOutboundCall(
  to: string, 
  dynamicVariables?: Record<string, string>,
  agentId?: string
): Promise<{ callId: string }> {
  const targetAgentId = agentId || elevenLabsConfig.agentId;
  
  if (!elevenLabsConfig.apiKey || !targetAgentId) {
    throw new Error("ElevenLabs not configured for outbound calls");
  }

  // Use ElevenLabs outbound call API
  // This creates a phone call where the AI agent calls the customer
  const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID || "";
  
  const response = await fetch(
    "https://api.elevenlabs.io/v1/convai/conversations/create-phone-call",
    {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsConfig.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: targetAgentId,
        agent_phone_number_id: phoneNumberId,
        customer_phone_number: to,
        conversation_initiation_client_data: dynamicVariables ? {
          dynamic_variables: dynamicVariables,
        } : undefined,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Calls] ElevenLabs outbound error:", errorText);
    throw new Error(`ElevenLabs outbound call failed: ${response.status}`);
  }

  const data: any = await response.json();
  console.log("[Calls] Outbound call initiated:", {
    conversationId: data.conversation_id,
    to,
  });
  
  return { callId: data.conversation_id || randomUUID() };
}

/**
 * Initiate batch calls via ElevenLabs Batch Calling API
 * @see https://elevenlabs.io/docs/conversational-ai/phone-calls/batch-calling
 */
async function initiateBatchCalls(
  recipients: Array<{ phone: string; variables?: Record<string, string> }>,
  campaignName?: string,
  agentId?: string,
  scheduledFor?: string
): Promise<{ campaignId: string }> {
  const targetAgentId = agentId || elevenLabsConfig.agentId;
  
  if (!elevenLabsConfig.apiKey || !targetAgentId) {
    throw new Error("ElevenLabs not configured for batch calls");
  }

  const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID || "";

  // Use ElevenLabs batch calling API
  const response = await fetch(
    "https://api.elevenlabs.io/v1/convai/batch-calling/calls",
    {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsConfig.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: targetAgentId,
        agent_phone_number_id: phoneNumberId,
        name: campaignName || `Batch ${new Date().toISOString()}`,
        ...(scheduledFor ? { scheduled_time: scheduledFor } : {}),
        recipients: recipients.map(r => ({
          phone_number: r.phone,
          ...(r.variables ? { 
            conversation_initiation_client_data: {
              dynamic_variables: r.variables,
            },
          } : {}),
        })),
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Calls] ElevenLabs batch error:", errorText);
    throw new Error(`Batch calling failed: ${response.status}`);
  }

  const data: any = await response.json();
  console.log("[Calls] Batch calls initiated:", {
    campaignId: data.batch_call_id,
    count: recipients.length,
  });
  
  return { campaignId: data.batch_call_id || randomUUID() };
}

console.log("[Admin Assistant] Calls routes configured");
