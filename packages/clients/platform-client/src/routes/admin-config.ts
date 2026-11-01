/**
 * Admin Configuration Routes — Platform Settings API
 * 
 * Manages all platform configuration via the Admin Console.
 * Configuration is persisted to database (with in-memory fallback).
 * 
 * ARCHITECTURE:
 * - Database: Persistent storage (Prisma/PostgreSQL) — when DATABASE_URL is set
 * - In-memory: Fallback when DATABASE_URL not set (config resets on restart)
 * 
 * @module routes/admin-config
 */

import { Router, type Router as RouterType } from "express";
import { getDatabase, isDatabaseAvailable } from "../services/database.js";
import { tenantId } from "../config.js";
import { 
  buildSystemPrompt, 
  buildGreeting, 
  getIndustryTemplates,
  getIndustryPromptConfig,
  globalToolRegistry,
} from "@platform/core";
import { updateNotifyConfig } from "./admin-assistant/escalation.js";

const router: RouterType = Router();

// ============================================================================
// TYPES
// ============================================================================

export type Industry = 'ecommerce' | 'hospitality' | 'healthcare' | 'banking' | 'restaurant' | null;

/**
 * Conversation Mode - How users interact with the AI agent
 * 
 * Based on ElevenLabs modality configuration:
 * - voice_only: Speech input/output only (default, highest cost)
 * - voice_and_text: Users can switch between voice and text (multimodal)
 * - text_only: Chat mode, no audio (lowest cost, 25x higher concurrency)
 * 
 * @see https://elevenlabs.io/docs/agents-platform/guides/chat-mode
 */
export type ConversationMode = 'voice_only' | 'voice_and_text' | 'text_only';

/**
 * Conversation flow settings
 * @see https://elevenlabs.io/docs/agents-platform/customization/conversation-flow
 */
export interface ConversationFlowConfig {
  /** Turn timeout in seconds (1-30) - how long to wait for user response */
  turnTimeout: number;
  /** Allow users to interrupt the agent while speaking */
  allowInterruptions: boolean;
  /** How eagerly the agent responds: 'eager' | 'normal' | 'patient' */
  turnEagerness: 'eager' | 'normal' | 'patient';
  /** Inactivity timeout in seconds - terminate conversation if user is idle (default: 120 = 2 min) */
  inactivityTimeout: number;
  /** Maximum follow-up prompts when user is silent (0 = none, saves tokens) */
  maxIdlePrompts: number;
  /** Maximum conversation duration in seconds (0 = unlimited, default: 600 = 10 min) */
  maxDuration: number;
  /** Silence threshold in ms for voice mode (default: 500) */
  silenceThreshold: number;
  /** What happens when conversation opens: 'none' | 'text' | 'voice' */
  firstMessageMode: 'none' | 'text' | 'voice';
  /** Wait for user to send first message before connecting */
  waitForUserFirst: boolean;
  /** Optional greeting message */
  greeting?: string;
}

export interface EscalationConfig {
  /** Auto-escalate after this many AI messages in one session (0 = disabled) */
  messageThreshold: number;
  /** Keywords that trigger immediate escalation */
  keywords: string[];
  /** Phone number to receive SMS alerts when escalation occurs */
  alertPhone: string;
  /** Webhook URL for external notification (Slack, Teams, PagerDuty) */
  webhookUrl: string;
  /** Enable live call transfer via Twilio Conference when voice escalation triggers */
  enableCallTransfer: boolean;
  /** Phone number to transfer calls to (agent/supervisor) */
  transferPhone: string;
  /** Enable escalation notifications */
  notificationsEnabled: boolean;
}

/**
 * Map firstMessageMode values from Admin Console to chat widget expected values
 * Admin Console uses: 'none' | 'greeting' | 'prompt'
 * Chat widget expects: 'none' | 'text' | 'voice'
 */
function mapFirstMessageMode(value: string | null | undefined): 'none' | 'text' | 'voice' {
  switch (value) {
    case 'greeting':
    case 'text':
      return 'text';
    case 'prompt':
    case 'voice':
      return 'voice';
    default:
      return 'none';
  }
}

export interface WidgetConfig {
  /** Primary brand color (hex) */
  primaryColor: string;
  /** Secondary/accent color (hex) — used for hover states, accents */
  secondaryColor: string;
  /** Widget title */
  title: string;
  /** Widget subtitle */
  subtitle: string;
  /** Widget position on screen */
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Widget width in pixels */
  widgetWidth: number;
  /** Widget height in pixels */
  widgetHeight: number;
  /** Trigger button size in pixels */
  buttonSize: number;
  /** Border radius in pixels (0 = sharp, 24 = very rounded) */
  borderRadius: number;
  /** Show language selector in chat header */
  showLanguageSelector: boolean;
  /** Powered by text */
  poweredByText: string;
  /** Powered by link */
  poweredByLink: string;
  /** Show powered by footer */
  showPoweredBy: boolean;
  /** Allowed domains for widget embedding (enterprise security) */
  allowedDomains: string[];
}

export interface BrandingConfig {
  /** Company name */
  companyName: string;
  /** Logo URL */
  logoUrl: string;
}

export interface PlatformConfig {
  industry: Industry;
  channels: {
    voiceCalls: boolean;
    sms: boolean;
    whatsApp: boolean;
    email: boolean;
  };
  /** How users interact with the AI: voice_only, voice_and_text, or text_only */
  conversationMode: ConversationMode;
  /** Conversation flow settings (timeouts, interruptions, turn-taking) */
  conversationFlow: ConversationFlowConfig;
  backendApiUrl: string;
  /** API key for authenticating with client's backend */
  backendApiKey: string;
  elevenLabs: {
    apiKey: string;
    agentId: string;
    phoneNumberId: string;
    connected: boolean;
  };
  twilio: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
    configured: boolean;
  };
  /** WhatsApp Business API configuration */
  whatsApp: {
    phoneNumberId: string;
    accessToken: string;
    verifyToken: string;
    businessName: string;
    configured: boolean;
  };
  /** Widget appearance configuration */
  widget: WidgetConfig;
  /** Branding configuration */
  branding: BrandingConfig;
  /** Escalation settings (thresholds, notifications, call transfer) */
  escalation: EscalationConfig;
}

// ============================================================================
// DATABASE CONNECTION (uses shared utility)
// ============================================================================

async function initConfig(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log('[admin-config] No DATABASE_URL - using in-memory storage (config resets on restart)');
    return;
  }
  
  try {
    const db = await getDatabase();
    if (db) {
      console.log('[admin-config] ✅ Database available - config will persist');
      // Load initial config from database into memory
      await loadConfigFromDb();
    } else {
      console.warn('[admin-config] ⚠️ Database not available - using in-memory storage');
    }
  } catch (error) {
    console.warn('[admin-config] ⚠️ Database connection failed - using in-memory storage');
    console.warn('[admin-config] Error:', error instanceof Error ? error.message : String(error));
  }
}

// Initialize config on module load
initConfig().catch(console.error);

// ============================================================================
// IN-MEMORY CONFIG (Always used, synced with DB when available)
// ============================================================================

let memoryConfig: PlatformConfig = {
  industry: null,
  channels: {
    voiceCalls: false,
    sms: false,
    whatsApp: false,
    email: false,
  },
  conversationMode: 'text_only',  // Default: text-only (lowest cost, 25x concurrency)
  conversationFlow: {
    turnTimeout: 10,           // 10 seconds
    allowInterruptions: true,  // Natural conversation
    turnEagerness: 'normal',   // Balanced response timing
    inactivityTimeout: 120,    // 2 minutes - terminate if user idle
    maxIdlePrompts: 0,         // Don't prompt idle users (saves tokens)
    maxDuration: 600,          // 10 minutes max conversation
    silenceThreshold: 500,     // 500ms silence for voice mode
    firstMessageMode: 'none',  // Don't speak/message on open (saves tokens)
    waitForUserFirst: true,    // Wait for user to initiate
    greeting: undefined,
  },
  backendApiUrl: '',
  backendApiKey: '',
  elevenLabs: {
    apiKey: '',
    agentId: '',
    phoneNumberId: '',
    connected: false,
  },
  twilio: {
    accountSid: '',
    authToken: '',
    phoneNumber: '',
    configured: false,
  },
  whatsApp: {
    phoneNumberId: '',
    accessToken: '',
    verifyToken: '',
    businessName: '',
    configured: false,
  },
  widget: {
    primaryColor: '#6366f1',
    secondaryColor: '#8b5cf6',
    title: 'AI Assistant',
    subtitle: 'How can I help you today?',
    position: 'bottom-right',
    widgetWidth: 400,
    widgetHeight: 600,
    buttonSize: 56,
    borderRadius: 16,
    showLanguageSelector: true,
    poweredByText: 'Bonga Nami',
    poweredByLink: '',
    showPoweredBy: true,
    allowedDomains: [],  // Empty = allow all (development mode)
  },
  branding: {
    companyName: '',
    logoUrl: '',
  },
  escalation: {
    messageThreshold: 10,        // Auto-escalate after 10 AI messages
    keywords: ['speak to human', 'talk to agent', 'manager', 'complaint'],
    alertPhone: '',              // SMS alert phone (set in admin console)
    webhookUrl: '',              // Slack/Teams/PagerDuty webhook
    enableCallTransfer: false,   // Twilio Conference live transfer
    transferPhone: '',           // Phone to transfer calls to
    notificationsEnabled: true,
  },
};

// ============================================================================
// CONFIG HELPERS
// ============================================================================

/**
 * Load config from database into memory
 */
async function loadConfigFromDb(): Promise<void> {
  const prisma = await getDatabase();
  if (!prisma) return;
  
  try {
    const dbConfig = await prisma.platformConfig.findUnique({
      where: { tenantId },
    });
    
    if (dbConfig) {
      memoryConfig = {
        industry: dbConfig.industry as Industry,
        channels: {
          voiceCalls: dbConfig.channelVoice,
          sms: dbConfig.channelSms,
          whatsApp: dbConfig.channelWhatsApp ?? false,
          email: dbConfig.channelEmail ?? false,
        },
        conversationMode: (dbConfig.conversationMode as ConversationMode) || 'text_only',
        conversationFlow: {
          turnTimeout: dbConfig.turnTimeout ?? 10,
          allowInterruptions: dbConfig.allowInterruptions ?? true,
          turnEagerness: (dbConfig.turnEagerness as 'eager' | 'normal' | 'patient') || 'normal',
          inactivityTimeout: dbConfig.inactivityTimeout ?? 120,
          maxIdlePrompts: dbConfig.maxIdlePrompts ?? 0,
          maxDuration: dbConfig.maxDuration ?? 600,
          silenceThreshold: dbConfig.silenceThreshold ?? 500,
          // Map legacy values: 'greeting' → 'text', 'prompt' → 'voice'
          firstMessageMode: mapFirstMessageMode(dbConfig.firstMessageMode as string),
          waitForUserFirst: dbConfig.waitForUserFirst ?? true,
          greeting: dbConfig.greeting ?? undefined,
        },
        backendApiUrl: dbConfig.backendApiUrl || '',
        backendApiKey: dbConfig.backendApiKey || '',
        elevenLabs: {
          apiKey: dbConfig.elevenLabsApiKey || '',
          agentId: dbConfig.elevenLabsAgentId || '',
          phoneNumberId: dbConfig.elevenLabsPhoneNumberId || '',
          connected: !!(dbConfig.elevenLabsApiKey && dbConfig.elevenLabsAgentId),
        },
        twilio: {
          accountSid: dbConfig.twilioAccountSid || '',
          authToken: dbConfig.twilioAuthToken || '',
          phoneNumber: dbConfig.twilioPhoneNumber || '',
          configured: !!(dbConfig.twilioAccountSid && dbConfig.twilioAuthToken),
        },
        whatsApp: {
          phoneNumberId: dbConfig.whatsappPhoneNumberId || '',
          accessToken: dbConfig.whatsappAccessToken || '',
          verifyToken: dbConfig.whatsappVerifyToken || '',
          businessName: dbConfig.whatsappBusinessName || '',
          configured: !!(dbConfig.whatsappPhoneNumberId && dbConfig.whatsappAccessToken),
        },
        widget: {
          primaryColor: (dbConfig as any).widgetPrimaryColor || '#6366f1',
          secondaryColor: (dbConfig as any).widgetSecondaryColor || '#8b5cf6',
          title: (dbConfig as any).widgetTitle || 'AI Assistant',
          subtitle: (dbConfig as any).widgetSubtitle || 'How can I help you today?',
          position: ((dbConfig as any).widgetPosition as 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left') || 'bottom-right',
          widgetWidth: (dbConfig as any).widgetWidth ?? 400,
          widgetHeight: (dbConfig as any).widgetHeight ?? 600,
          buttonSize: (dbConfig as any).widgetButtonSize ?? 56,
          borderRadius: (dbConfig as any).widgetBorderRadius ?? 16,
          showLanguageSelector: (dbConfig as any).widgetShowLanguageSelector ?? true,
          poweredByText: (dbConfig as any).widgetPoweredByText || 'Bonga Nami',
          poweredByLink: (dbConfig as any).widgetPoweredByLink ?? '',
          showPoweredBy: (dbConfig as any).widgetShowPoweredBy ?? true,
          allowedDomains: (dbConfig as any).widgetAllowedDomains || [],
        },
        branding: {
          companyName: (dbConfig as any).brandingCompanyName || '',
          logoUrl: (dbConfig as any).brandingLogoUrl || '',
        },
        escalation: {
          messageThreshold: (dbConfig as any).escalationMessageThreshold ?? 10,
          keywords: (dbConfig as any).escalationKeywords || ['speak to human', 'talk to agent', 'manager', 'complaint'],
          alertPhone: (dbConfig as any).escalationAlertPhone || '',
          webhookUrl: (dbConfig as any).escalationWebhookUrl || '',
          enableCallTransfer: (dbConfig as any).escalationEnableCallTransfer ?? false,
          transferPhone: (dbConfig as any).escalationTransferPhone || '',
          notificationsEnabled: (dbConfig as any).escalationNotificationsEnabled ?? true,
        },
      };
      console.log('[admin-config] ✅ Loaded config from database');
    }
  } catch (error) {
    console.error('[admin-config] Failed to load config from database:', error);
  }
}

/**
 * Save config to database
 */
async function saveConfigToDb(config: PlatformConfig): Promise<void> {
  const prisma = await getDatabase();
  if (!prisma) return;
  
  try {
    // Note: Widget fields added in schema update - run `prisma generate` if TypeScript errors
    const dbData = {
      tenantId,
      industry: config.industry,
      channelVoice: config.channels.voiceCalls,
      channelSms: config.channels.sms,
      conversationMode: config.conversationMode,
      turnTimeout: config.conversationFlow.turnTimeout,
      allowInterruptions: config.conversationFlow.allowInterruptions,
      turnEagerness: config.conversationFlow.turnEagerness,
      inactivityTimeout: config.conversationFlow.inactivityTimeout,
      maxIdlePrompts: config.conversationFlow.maxIdlePrompts,
      maxDuration: config.conversationFlow.maxDuration,
      silenceThreshold: config.conversationFlow.silenceThreshold,
      firstMessageMode: config.conversationFlow.firstMessageMode,
      waitForUserFirst: config.conversationFlow.waitForUserFirst,
      greeting: config.conversationFlow.greeting || null,
      backendApiUrl: config.backendApiUrl || null,
      backendApiKey: config.backendApiKey || null,
      elevenLabsApiKey: config.elevenLabs.apiKey || null,
      elevenLabsAgentId: config.elevenLabs.agentId || null,
      elevenLabsPhoneNumberId: config.elevenLabs.phoneNumberId || null,
      twilioAccountSid: config.twilio.accountSid || null,
      twilioAuthToken: config.twilio.authToken || null,
      twilioPhoneNumber: config.twilio.phoneNumber || null,
      // Widget config
      widgetPrimaryColor: config.widget?.primaryColor || '#6366f1',
      widgetSecondaryColor: config.widget?.secondaryColor || '#8b5cf6',
      widgetTitle: config.widget?.title || 'AI Assistant',
      widgetSubtitle: config.widget?.subtitle || 'How can I help you today?',
      widgetPosition: config.widget?.position || 'bottom-right',
      widgetWidth: config.widget?.widgetWidth ?? 400,
      widgetHeight: config.widget?.widgetHeight ?? 600,
      widgetButtonSize: config.widget?.buttonSize ?? 56,
      widgetBorderRadius: config.widget?.borderRadius ?? 16,
      widgetShowLanguageSelector: config.widget?.showLanguageSelector ?? true,
      widgetPoweredByText: config.widget?.poweredByText || 'Bonga Nami',
      widgetPoweredByLink: config.widget?.poweredByLink ?? '',
      widgetShowPoweredBy: config.widget?.showPoweredBy ?? true,
      widgetAllowedDomains: config.widget?.allowedDomains || [],
      // Branding
      brandingCompanyName: config.branding?.companyName || null,
      brandingLogoUrl: config.branding?.logoUrl || null,
      // Escalation
      escalationMessageThreshold: config.escalation?.messageThreshold ?? 10,
      escalationKeywords: config.escalation?.keywords || ['speak to human', 'talk to agent', 'manager', 'complaint'],
      escalationAlertPhone: config.escalation?.alertPhone || null,
      escalationWebhookUrl: config.escalation?.webhookUrl || null,
      escalationEnableCallTransfer: config.escalation?.enableCallTransfer ?? false,
      escalationTransferPhone: config.escalation?.transferPhone || null,
      escalationNotificationsEnabled: config.escalation?.notificationsEnabled ?? true,
    };
    
    await prisma.platformConfig.upsert({
      where: { tenantId },
      create: dbData as any,  // Cast needed until prisma generate runs
      update: dbData as any,
    });
    console.log('[admin-config] ✅ Config saved to database');
  } catch (error) {
    console.error('[admin-config] Failed to save config to database:', error);
  }
}

/**
 * Mask sensitive values for API responses
 */
function maskConfig(config: PlatformConfig): PlatformConfig {
  return {
    ...config,
    backendApiKey: config.backendApiKey
      ? '********************************'
      : '',
    elevenLabs: {
      ...config.elevenLabs,
      apiKey: config.elevenLabs.apiKey 
        ? config.elevenLabs.apiKey.substring(0, 6) + '************************'
        : '',
    },
    twilio: {
      ...config.twilio,
      authToken: config.twilio.authToken
        ? '********************************'
        : '',
    },
  };
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/config/platform
 */
router.get('/platform', async (_req, res) => {
  try {
    res.json({
      success: true,
      data: maskConfig(memoryConfig),
      storage: isDatabaseAvailable() ? 'database' : 'memory',
    });
  } catch (error) {
    console.error('[admin-config] Error fetching platform config:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch platform configuration' 
    });
  }
});

/**
 * PUT /api/admin/config/platform
 */
router.put('/platform', async (req, res) => {
  try {
    const updates = req.body as Partial<PlatformConfig>;
    
    // Validate industry
    const validIndustries: Industry[] = ['ecommerce', 'hospitality', 'healthcare', 'banking', 'restaurant', null];
    if (updates.industry !== undefined && !validIndustries.includes(updates.industry)) {
      res.status(400).json({
        success: false,
        error: `Invalid industry: ${updates.industry}`,
      });
      return;
    }

    // Reject malformed ElevenLabs keys — every valid key starts with sk_.
    // A wrong paste here silently breaks the widget and analytics until the next save.
    const incomingElKey = updates.elevenLabs?.apiKey;
    if (incomingElKey && !incomingElKey.includes('*') && !incomingElKey.startsWith('sk_')) {
      res.status(400).json({
        success: false,
        error: "That doesn't look like an ElevenLabs API key — it should start with sk_. Check ElevenLabs → Profile → API Keys.",
      });
      return;
    }

    // Build updated config
    const newConfig: PlatformConfig = {
      industry: updates.industry !== undefined ? updates.industry : memoryConfig.industry,
      channels: {
        voiceCalls: updates.channels?.voiceCalls ?? memoryConfig.channels.voiceCalls,
        sms: updates.channels?.sms ?? memoryConfig.channels.sms,
        whatsApp: updates.channels?.whatsApp ?? memoryConfig.channels.whatsApp,
        email: updates.channels?.email ?? memoryConfig.channels.email,
      },
      conversationMode: updates.conversationMode ?? memoryConfig.conversationMode,
      conversationFlow: {
        turnTimeout: updates.conversationFlow?.turnTimeout ?? memoryConfig.conversationFlow.turnTimeout,
        allowInterruptions: updates.conversationFlow?.allowInterruptions ?? memoryConfig.conversationFlow.allowInterruptions,
        turnEagerness: updates.conversationFlow?.turnEagerness ?? memoryConfig.conversationFlow.turnEagerness,
        inactivityTimeout: updates.conversationFlow?.inactivityTimeout ?? memoryConfig.conversationFlow.inactivityTimeout,
        maxIdlePrompts: updates.conversationFlow?.maxIdlePrompts ?? memoryConfig.conversationFlow.maxIdlePrompts,
        maxDuration: updates.conversationFlow?.maxDuration ?? memoryConfig.conversationFlow.maxDuration,
        silenceThreshold: updates.conversationFlow?.silenceThreshold ?? memoryConfig.conversationFlow.silenceThreshold,
        firstMessageMode: updates.conversationFlow?.firstMessageMode ?? memoryConfig.conversationFlow.firstMessageMode,
        waitForUserFirst: updates.conversationFlow?.waitForUserFirst ?? memoryConfig.conversationFlow.waitForUserFirst,
        greeting: updates.conversationFlow?.greeting ?? memoryConfig.conversationFlow.greeting,
      },
      backendApiUrl: updates.backendApiUrl ?? memoryConfig.backendApiUrl,
      backendApiKey: (updates.backendApiKey && !updates.backendApiKey.includes('*'))
        ? updates.backendApiKey
        : memoryConfig.backendApiKey,
      elevenLabs: {
        apiKey: (updates.elevenLabs?.apiKey && !updates.elevenLabs.apiKey.includes('*'))
          ? updates.elevenLabs.apiKey
          : memoryConfig.elevenLabs.apiKey,
        agentId: updates.elevenLabs?.agentId ?? memoryConfig.elevenLabs.agentId,
        phoneNumberId: updates.elevenLabs?.phoneNumberId ?? memoryConfig.elevenLabs.phoneNumberId,
        connected: false,
      },
      twilio: {
        accountSid: updates.twilio?.accountSid ?? memoryConfig.twilio.accountSid,
        authToken: (updates.twilio?.authToken && !updates.twilio.authToken.includes('*'))
          ? updates.twilio.authToken
          : memoryConfig.twilio.authToken,
        phoneNumber: updates.twilio?.phoneNumber ?? memoryConfig.twilio.phoneNumber,
        configured: false,
      },
      whatsApp: {
        phoneNumberId: updates.whatsApp?.phoneNumberId ?? memoryConfig.whatsApp.phoneNumberId,
        accessToken: (updates.whatsApp?.accessToken && !updates.whatsApp.accessToken.includes('*'))
          ? updates.whatsApp.accessToken
          : memoryConfig.whatsApp.accessToken,
        verifyToken: updates.whatsApp?.verifyToken ?? memoryConfig.whatsApp.verifyToken,
        businessName: updates.whatsApp?.businessName ?? memoryConfig.whatsApp.businessName,
        configured: false,
      },
      widget: {
        primaryColor: (updates as any).widget?.primaryColor ?? memoryConfig.widget.primaryColor,
        secondaryColor: (updates as any).widget?.secondaryColor ?? memoryConfig.widget.secondaryColor,
        title: (updates as any).widget?.title ?? memoryConfig.widget.title,
        subtitle: (updates as any).widget?.subtitle ?? memoryConfig.widget.subtitle,
        position: (updates as any).widget?.position ?? memoryConfig.widget.position,
        widgetWidth: (updates as any).widget?.widgetWidth ?? memoryConfig.widget.widgetWidth,
        widgetHeight: (updates as any).widget?.widgetHeight ?? memoryConfig.widget.widgetHeight,
        buttonSize: (updates as any).widget?.buttonSize ?? memoryConfig.widget.buttonSize,
        borderRadius: (updates as any).widget?.borderRadius ?? memoryConfig.widget.borderRadius,
        showLanguageSelector: (updates as any).widget?.showLanguageSelector ?? memoryConfig.widget.showLanguageSelector,
        poweredByText: (updates as any).widget?.poweredByText ?? memoryConfig.widget.poweredByText,
        poweredByLink: (updates as any).widget?.poweredByLink ?? memoryConfig.widget.poweredByLink,
        showPoweredBy: (updates as any).widget?.showPoweredBy ?? memoryConfig.widget.showPoweredBy,
        allowedDomains: (updates as any).widget?.allowedDomains ?? memoryConfig.widget.allowedDomains,
      },
      branding: {
        companyName: (updates as any).branding?.companyName ?? memoryConfig.branding.companyName,
        logoUrl: (updates as any).branding?.logoUrl ?? memoryConfig.branding.logoUrl,
      },
      escalation: {
        messageThreshold: updates.escalation?.messageThreshold ?? memoryConfig.escalation.messageThreshold,
        keywords: updates.escalation?.keywords ?? memoryConfig.escalation.keywords,
        alertPhone: updates.escalation?.alertPhone ?? memoryConfig.escalation.alertPhone,
        webhookUrl: updates.escalation?.webhookUrl ?? memoryConfig.escalation.webhookUrl,
        enableCallTransfer: updates.escalation?.enableCallTransfer ?? memoryConfig.escalation.enableCallTransfer,
        transferPhone: updates.escalation?.transferPhone ?? memoryConfig.escalation.transferPhone,
        notificationsEnabled: updates.escalation?.notificationsEnabled ?? memoryConfig.escalation.notificationsEnabled,
      },
    };
    
    // Recalculate connected/configured status
    newConfig.elevenLabs.connected = !!(newConfig.elevenLabs.apiKey && newConfig.elevenLabs.agentId);
    newConfig.twilio.configured = !!(newConfig.twilio.accountSid && newConfig.twilio.authToken);
    newConfig.whatsApp.configured = !!(newConfig.whatsApp.phoneNumberId && newConfig.whatsApp.accessToken);

    // Update memory
    memoryConfig = newConfig;
    
    // Persist to database
    await saveConfigToDb(newConfig);

    // Sync escalation notification config
    updateNotifyConfig({
      smsAlertPhone: newConfig.escalation.alertPhone || undefined,
      webhookUrl: newConfig.escalation.webhookUrl || undefined,
      enabled: newConfig.escalation.notificationsEnabled,
    });

    console.log('[admin-config] Platform config updated:', {
      industry: newConfig.industry,
      channels: newConfig.channels,
      backendApiUrl: newConfig.backendApiUrl ? '(set)' : '(empty)',
      elevenLabsConnected: newConfig.elevenLabs.connected,
      twilioConfigured: newConfig.twilio.configured,
    });

    res.json({
      success: true,
      data: maskConfig(newConfig),
      message: 'Configuration saved successfully',
      storage: isDatabaseAvailable() ? 'database' : 'memory',
    });
  } catch (error) {
    console.error('[admin-config] Error updating platform config:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update platform configuration' 
    });
  }
});

/**
 * GET /api/admin/config/industry
 */
router.get('/industry', (_req, res) => {
  res.json({
    success: true,
    data: memoryConfig.industry,
  });
});

/**
 * GET /api/admin/config/backend-url
 */
router.get('/backend-url', (_req, res) => {
  res.json({
    success: true,
    data: memoryConfig.backendApiUrl,
  });
});

/**
 * GET /api/admin/config/status
 */
router.get('/status', (_req, res) => {
  res.json({
    success: true,
    data: {
      tenantId,
      storage: isDatabaseAvailable() ? 'database' : 'memory',
      configured: {
        industry: !!memoryConfig.industry,
        backendApi: !!memoryConfig.backendApiUrl,
        elevenLabs: memoryConfig.elevenLabs.connected,
        twilio: memoryConfig.twilio.configured,
      },
      channels: memoryConfig.channels,
      industry: memoryConfig.industry,
    },
  });
});

// ============================================================================
// PROMPT BUILDER ROUTES
// ============================================================================

/**
 * GET /api/admin/config/prompt/templates
 * 
 * Get available industry prompt templates
 */
router.get('/prompt/templates', (_req, res) => {
  const templates = getIndustryTemplates().map(industry => ({
    id: industry,
    ...getIndustryPromptConfig(industry),
  }));
  
  res.json({
    success: true,
    data: templates,
  });
});

/**
 * GET /api/admin/config/prompt/generate
 * 
 * Generate a system prompt for the current industry configuration.
 * Includes all registered tools.
 */
router.get('/prompt/generate', (req, res) => {
  const query = req.query as { 
    businessName?: string; 
    agentName?: string;
    customInstructions?: string;
    language?: string;
  };
  
  if (!memoryConfig.industry) {
    return res.status(400).json({
      success: false,
      error: 'No industry selected. Configure industry in Platform Settings first.',
    });
  }
  
  // Get currently registered tools
  const tools = globalToolRegistry.getAll().map(t => t.definition);
  
  const prompt = buildSystemPrompt({
    industry: memoryConfig.industry,
    businessName: query.businessName || 'our business',
    agentName: query.agentName || 'Assistant',
    tools,
    customInstructions: query.customInstructions,
    language: query.language,
    includeToolInstructions: true,
  });
  
  const greeting = buildGreeting(memoryConfig.industry, query.agentName);
  
  res.json({
    success: true,
    data: {
      industry: memoryConfig.industry,
      prompt,
      greeting,
      toolCount: tools.length,
      characterCount: prompt.length,
    },
  });
});

/**
 * POST /api/admin/config/prompt/generate
 * 
 * Generate a custom system prompt with specific parameters
 */
router.post('/prompt/generate', (req, res) => {
  const { 
    industry,
    businessName, 
    agentName, 
    customInstructions,
    language,
    includeToolInstructions = true,
  } = req.body;
  
  const targetIndustry = industry || memoryConfig.industry;
  
  if (!targetIndustry) {
    return res.status(400).json({
      success: false,
      error: 'No industry specified or configured.',
    });
  }
  
  // Get currently registered tools
  const tools = globalToolRegistry.getAll().map(t => t.definition);
  
  const prompt = buildSystemPrompt({
    industry: targetIndustry,
    businessName: businessName || 'our business',
    agentName: agentName || 'Assistant',
    tools,
    customInstructions,
    language,
    includeToolInstructions,
  });
  
  const greeting = buildGreeting(targetIndustry, agentName);
  
  res.json({
    success: true,
    data: {
      industry: targetIndustry,
      prompt,
      greeting,
      toolCount: tools.length,
      characterCount: prompt.length,
    },
  });
});

export default router;

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

export function getPlatformConfig(): PlatformConfig {
  // Return config with normalized firstMessageMode for widget compatibility
  return {
    ...memoryConfig,
    conversationFlow: {
      ...memoryConfig.conversationFlow,
      // Always map firstMessageMode to ensure widget gets correct value
      // Admin Console uses: 'none' | 'greeting' | 'prompt'
      // Widget expects: 'none' | 'text' | 'voice'
      firstMessageMode: mapFirstMessageMode(memoryConfig.conversationFlow.firstMessageMode),
    },
  };
}

export function getBackendApiUrl(): string {
  return memoryConfig.backendApiUrl || '';
}

export function getBackendApiKey(): string {
  return memoryConfig.backendApiKey || '';
}

export function getIndustry(): Industry {
  return memoryConfig.industry;
}

export function getTwilioConfig() {
  return { ...memoryConfig.twilio };
}

export function getElevenLabsConfig() {
  return { ...memoryConfig.elevenLabs };
}

/**
 * Get allowed domains for widget embedding.
 * Used by public-config.ts for origin validation.
 * 
 * Returns array of allowed domains, e.g.:
 * - "example.com" (exact match)
 * - "*.example.com" (wildcard subdomains)
 *
 * Union of WIDGET_ALLOWED_DOMAINS env var (infra-level bootstrap, works
 * before the Admin Console is configured) and Admin Console settings.
 */
export function getAllowedWidgetDomains(): string[] {
  const fromEnv = process.env.WIDGET_ALLOWED_DOMAINS?.split(",")
    .map((d) => d.trim())
    .filter(Boolean) ?? [];
  const fromConsole = memoryConfig.widget?.allowedDomains || [];
  return [...new Set([...fromEnv, ...fromConsole])];
}
