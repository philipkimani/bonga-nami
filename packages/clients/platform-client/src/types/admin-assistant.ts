/**
 * Admin Assistant Types
 * 
 * Type definitions for the AI Omnichannel Customer Service platform.
 * Handles Calls, SMS, and WhatsApp via Twilio + ElevenLabs.
 * 
 * DEPLOYMENT: Single-tenant - each client has own Twilio/ElevenLabs accounts
 * COMPLIANCE: Kenya DPA 2019 - client is data controller
 */

// ============================================================================
// COMMON TYPES
// ============================================================================

export type Channel = "voice" | "sms" | "whatsapp";

export type ConversationStatus = 
  | "active"      // Ongoing conversation
  | "ai_handled"  // Completed by AI
  | "escalated"   // Transferred to human
  | "completed"   // Closed by human agent
  | "abandoned";  // No response, timed out

export interface Contact {
  id: string;
  phoneNumber: string;           // E.164 format: +254712345678
  displayName?: string;
  email?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  contactId: string;
  channel: Channel;
  status: ConversationStatus;
  startedAt: Date;
  endedAt?: Date;
  
  // AI handling
  aiAgentId?: string;            // ElevenLabs agent ID
  aiHandledCount: number;        // Messages handled by AI
  
  // Human escalation
  escalatedAt?: Date;
  escalatedTo?: string;          // Human agent ID
  escalationReason?: string;
  
  // Context for personalization
  dynamicVariables?: Record<string, string>;
  
  // Audit
  twilioCallSid?: string;
  twilioSmsSid?: string;
  metadata?: Record<string, unknown>;
}

export interface Message {
  id: string;
  conversationId: string;
  channel: Channel;
  direction: "inbound" | "outbound";
  sender: "customer" | "ai" | "human";
  
  // Content
  content: string;
  mediaUrls?: string[];          // For WhatsApp media
  
  // Twilio tracking
  twilioSid?: string;
  twilioStatus?: string;
  
  // Timestamps
  createdAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
}

// ============================================================================
// VOICE CALL TYPES (Twilio + ElevenLabs)
// ============================================================================

export type CallDirection = "inbound" | "outbound";
export type CallStatus = 
  | "queued"
  | "ringing"
  | "in-progress"
  | "ai-handling"
  | "on-hold"
  | "transferred"
  | "completed"
  | "busy"
  | "failed"
  | "no-answer"
  | "canceled";

export interface Call {
  id: string;
  conversationId: string;
  twilioCallSid: string;
  
  direction: CallDirection;
  status: CallStatus;
  
  from: string;                  // +254... caller number
  to: string;                    // +254... your Twilio number
  
  // AI handling
  aiAgentId?: string;
  aiConnectedAt?: Date;
  
  // Duration tracking
  startedAt: Date;
  answeredAt?: Date;
  endedAt?: Date;
  durationSeconds?: number;
  
  // Recording (if enabled by client)
  recordingUrl?: string;
  recordingSid?: string;
  
  // Human escalation
  transferredTo?: string;
  transferredAt?: Date;
}

// ============================================================================
// SMS TYPES
// ============================================================================

export type SmsStatus = 
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "undelivered"
  | "failed";

export interface SmsMessage extends Message {
  channel: "sms";
  smsStatus: SmsStatus;
  errorCode?: string;
  errorMessage?: string;
  
  // Cost tracking (for billing)
  segments?: number;             // Number of SMS segments
  pricePerSegment?: number;
}

// ============================================================================
// WHATSAPP TYPES
// ============================================================================

export type WhatsAppMessageType = 
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "location"
  | "template"
  | "interactive";

export interface WhatsAppMessage extends Message {
  channel: "whatsapp";
  messageType: WhatsAppMessageType;
  
  // Template messages (for outbound)
  templateName?: string;
  templateVariables?: string[];
  
  // Media
  mediaCaption?: string;
  mediaContentType?: string;
  
  // Voice call via WhatsApp (ElevenLabs native)
  isVoiceCall?: boolean;
  voiceCallDuration?: number;
}

// ============================================================================
// BATCH CALLING (ElevenLabs Batch API)
// ============================================================================

export type BatchCallStatus = 
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface BatchCallCampaign {
  id: string;
  name: string;
  agentId: string;               // ElevenLabs agent ID
  
  status: BatchCallStatus;
  scheduledFor?: Date;
  startedAt?: Date;
  completedAt?: Date;
  
  // Recipients
  recipientCount: number;
  completedCount: number;
  failedCount: number;
  
  // Dynamic variables per recipient
  recipients: BatchCallRecipient[];
  
  // Results
  averageDuration?: number;
  successRate?: number;
}

export interface BatchCallRecipient {
  phoneNumber: string;
  dynamicVariables?: Record<string, string>;
  status?: "pending" | "completed" | "failed" | "no-answer";
  callSid?: string;
  callDuration?: number;
  completedAt?: Date;
}

// ============================================================================
// HUMAN ESCALATION
// ============================================================================

export interface EscalationRule {
  id: string;
  name: string;
  channel: Channel | "all";
  
  // Triggers
  triggerPhrases?: string[];     // "speak to human", "manager", etc.
  triggerIntents?: string[];     // From AI intent detection
  triggerAfterMessages?: number; // Escalate after X AI messages
  triggerOnSentiment?: "negative" | "frustrated";
  
  // Action
  escalateTo: "queue" | "specific_agent" | "department";
  targetId?: string;             // Agent ID or department ID
  
  // Notification
  notifyVia?: ("sms" | "email" | "webhook")[];
  notifyTarget?: string;
  
  isActive: boolean;
}

export interface HumanAgent {
  id: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  
  // Availability
  isAvailable: boolean;
  currentLoad: number;           // Active conversations
  maxLoad: number;               // Max concurrent conversations
  
  // Skills
  channels: Channel[];
  languages?: string[];
  specializations?: string[];
}

// ============================================================================
// WEBHOOK PAYLOADS (Twilio -> Your Server)
// ============================================================================

export interface TwilioVoiceWebhook {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus: string;
  Direction: string;
  ApiVersion: string;
  Caller: string;
  Called: string;
  
  // For forwarded calls
  ForwardedFrom?: string;
  CallerCity?: string;
  CallerState?: string;
  CallerCountry?: string;
  
  // For completed calls
  CallDuration?: string;
  RecordingUrl?: string;
  RecordingSid?: string;
}

export interface TwilioSmsWebhook {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body: string;
  
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  
  // Delivery status
  MessageStatus?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

export interface TwilioWhatsAppWebhook extends TwilioSmsWebhook {
  ProfileName?: string;
  WaId?: string;                 // WhatsApp ID
  
  // Button responses
  ButtonText?: string;
  ButtonPayload?: string;
  
  // Location
  Latitude?: string;
  Longitude?: string;
}

// ============================================================================
// CONVERSATION INITIATION (ElevenLabs -> Your Server)
// ============================================================================

export interface ConversationInitiationRequest {
  type: "conversation_initiation_client_data_request";
  agent_id: string;
  conversation_id: string;
  
  // For phone calls
  phone_number?: string;
  
  // For WhatsApp
  whatsapp_id?: string;
}

export interface ConversationInitiationResponse {
  dynamic_variables?: Record<string, string>;
  conversation_config_override?: {
    agent?: {
      prompt?: {
        prompt?: string;
      };
      first_message?: string;
      language?: string;
    };
  };
}

// ============================================================================
// ANALYTICS
// ============================================================================

export interface ChannelMetrics {
  channel: Channel;
  period: "day" | "week" | "month";
  
  // Volume
  totalConversations: number;
  totalMessages: number;
  
  // AI performance
  aiHandledPercentage: number;
  averageAiMessages: number;
  escalationRate: number;
  
  // Response times
  averageResponseTime: number;   // Seconds
  firstResponseTime: number;
  
  // Cost
  totalCost?: number;
  costPerConversation?: number;
}
