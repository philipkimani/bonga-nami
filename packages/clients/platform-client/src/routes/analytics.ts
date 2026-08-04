/**
 * Analytics API Routes
 * 
 * Provides conversation metrics and analytics endpoints.
 * Primary data source: ElevenLabs Conversations API (source of truth).
 * Secondary: in-memory collector for real-time active sessions.
 * Escalation data: unified escalation queue.
 * 
 * @module routes/analytics
 */

import express from "express";
import { getDatabase, isDatabaseAvailable } from "../services/database.js";
import { metricsCollector, ConversationChannel } from "@platform/core";
import { tenantId } from "../config.js";
import { getPlatformConfig } from "./admin-config.js";
import { getQueueStats, getQueue } from "./admin-assistant/escalation.js";

export const analyticsRouter = express.Router();

// ============================================================================
// DATABASE CONNECTION (uses shared utility)
// ============================================================================

async function initAnalytics(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  
  const db = await getDatabase();
  if (db) {
    console.log('[analytics] Database connected for persistent storage');
  } else {
    console.log('[analytics] Database not available, using in-memory only');
  }
}

initAnalytics().catch(console.error);

// ============================================================================
// ELEVENLABS CONVERSATIONS API (Source of Truth)
// ============================================================================

/**
 * Helper: fetch from ElevenLabs Conversations API.
 */
async function fetchElevenLabs(path: string, params?: Record<string, string>): Promise<any> {
  const config = getPlatformConfig();
  const apiKey = config.elevenLabs?.apiKey;
  if (!apiKey) throw new Error('ElevenLabs API key not configured');

  const url = new URL(`https://api.elevenlabs.io${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url.toString(), {
    headers: { 'xi-api-key': apiKey },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ElevenLabs API ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * GET /api/analytics/conversations
 * 
 * Proxy to ElevenLabs list conversations API.
 * Returns conversations with computed metrics for dashboard/analytics.
 * 
 * Query params:
 *   range: 'today' | 'week' | '2weeks' | 'month' | '30days' (default: today)
 *   date:  'YYYY-MM-DD' — specific day (overrides range)
 *   cursor: pagination cursor
 *   page_size: 1-100 (default: 100)
 */
analyticsRouter.get('/conversations', async (req, res) => {
  try {
    const config = getPlatformConfig();
    const agentId = config.elevenLabs?.agentId;
    if (!agentId) {
      res.json({ success: false, error: 'ElevenLabs Agent ID not configured' });
      return;
    }

    // Calculate time range
    const range = (req.query.range as string) || 'today';
    const customDate = req.query.date as string | undefined; // YYYY-MM-DD
    let startAfter: number;
    let endBefore: number | undefined;

    if (customDate && /^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
      // Specific day filter
      const dayStart = new Date(customDate + 'T00:00:00');
      const dayEnd = new Date(customDate + 'T23:59:59');
      startAfter = Math.floor(dayStart.getTime() / 1000);
      endBefore = Math.floor(dayEnd.getTime() / 1000);
    } else {
      switch (range) {
        case 'week': {
          const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0,0,0,0);
          startAfter = Math.floor(d.getTime() / 1000);
          break;
        }
        case '2weeks': {
          const d = new Date(); d.setDate(d.getDate() - 14); d.setHours(0,0,0,0);
          startAfter = Math.floor(d.getTime() / 1000);
          break;
        }
        case 'month': {
          const d = new Date(); d.setDate(1); d.setHours(0,0,0,0);
          startAfter = Math.floor(d.getTime() / 1000);
          break;
        }
        case '30days': {
          const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0);
          startAfter = Math.floor(d.getTime() / 1000);
          break;
        }
        default: { // 'today'
          const d = new Date(); d.setHours(0,0,0,0);
          startAfter = Math.floor(d.getTime() / 1000);
        }
      }
    }

    // Fetch all conversations in range (paginate if needed)
    const allConversations: any[] = [];
    let cursor = req.query.cursor as string | undefined;
    let hasMore = true;
    const maxPages = 10; // Safety limit
    let page = 0;

    while (hasMore && page < maxPages) {
      const params: Record<string, string> = {
        agent_id: agentId,
        call_start_after_unix: startAfter.toString(),
        page_size: '100',
        summary_mode: 'include',
      };
      if (endBefore) params.call_start_before_unix = endBefore.toString();
      if (cursor) params.cursor = cursor;

      const data = await fetchElevenLabs('/v1/convai/conversations', params);
      const conversations = data.conversations || [];
      allConversations.push(...conversations);
      hasMore = data.has_more === true;
      cursor = data.next_cursor || undefined;
      page++;
    }

    // Compute metrics
    const total = allConversations.length;
    let totalDuration = 0;
    let totalMessages = 0;
    let successCount = 0;
    let failCount = 0;
    const bySource: Record<string, number> = {};
    const byLanguage: Record<string, number> = {};
    const toolUsage: Record<string, number> = {};

    for (const c of allConversations) {
      totalDuration += c.call_duration_secs || 0;
      totalMessages += c.message_count || 0;
      if (c.call_successful === 'success') successCount++;
      else if (c.call_successful === 'failure') failCount++;
      
      // Source breakdown — default to 'Web Chat' for widget-initiated conversations
      let src = c.conversation_initiation_source || '';
      if (!src || src === 'unknown') src = 'Web Chat';
      else if (src === 'twilio_phone_call' || src === 'phone') src = 'Phone Call';
      else if (src === 'twilio_sms' || src === 'sms') src = 'SMS';
      else if (src === 'whatsapp') src = 'WhatsApp';
      bySource[src] = (bySource[src] || 0) + 1;

      // Language breakdown
      if (c.main_language) {
        byLanguage[c.main_language] = (byLanguage[c.main_language] || 0) + 1;
      }

      // Tool usage
      if (c.tool_names?.length) {
        for (const t of c.tool_names) {
          toolUsage[t] = (toolUsage[t] || 0) + 1;
        }
      }
    }

    const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;
    const avgMessages = total > 0 ? Math.round((totalMessages / total) * 10) / 10 : 0;
    const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;
    const escalationRate = total > 0 ? Math.round((failCount / total) * 100) : 0;

    // Escalation queue stats
    const escStats = getQueueStats();

    res.json({
      success: true,
      data: {
        range,
        metrics: {
          totalConversations: total,
          totalDurationSecs: totalDuration,
          avgDurationSecs: avgDuration,
          totalMessages,
          avgMessages,
          successRate,
          escalationRate,
          failCount,
          successCount,
        },
        escalation: {
          currentQueueSize: escStats.total,
          byChannel: escStats.byChannel,
          byUrgency: escStats.byUrgency,
          oldestWaitMinutes: escStats.oldestWaitMinutes,
        },
        breakdown: {
          bySource,
          byLanguage,
          toolUsage,
        },
        conversations: allConversations.map(c => {
          let src = c.conversation_initiation_source || '';
          if (!src || src === 'unknown') src = 'Web Chat';
          else if (src === 'twilio_phone_call' || src === 'phone') src = 'Phone Call';
          else if (src === 'twilio_sms' || src === 'sms') src = 'SMS';
          else if (src === 'whatsapp') src = 'WhatsApp';
          return {
            id: c.conversation_id,
            startTime: c.start_time_unix_secs,
            duration: c.call_duration_secs || 0,
            messages: c.message_count || 0,
            status: c.status,
            success: c.call_successful,
            source: src,
            language: c.main_language,
            summary: c.transcript_summary || c.call_summary_title || null,
            tools: c.tool_names || [],
            direction: c.direction,
            rating: c.rating,
            agentId: c.agent_id || null,
            agentName: c.agent_name || null,
            userId: c.user_id || null,
            hasAudio: !!c.has_audio,
          };
        }),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[analytics] ElevenLabs conversations error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/conversations/:id
 * 
 * Get full conversation detail including transcript from ElevenLabs.
 */
analyticsRouter.get('/conversations/:id', async (req, res) => {
  try {
    const data = await fetchElevenLabs(`/v1/convai/conversations/${req.params.id}`);

    res.json({
      success: true,
      data: {
        conversationId: data.conversation_id,
        agentId: data.agent_id,
        agentName: data.agent_name,
        status: data.status,
        hasAudio: data.has_audio,
        hasUserAudio: data.has_user_audio,
        hasResponseAudio: data.has_response_audio,
        transcript: (data.transcript || []).map((t: any) => ({
          role: t.role,
          message: t.message,
          timeInCallSecs: t.time_in_call_secs,
        })),
        metadata: {
          startTime: data.metadata?.start_time_unix_secs,
          duration: data.metadata?.call_duration_secs,
          cost: data.metadata?.cost,
          latencyAvg: data.metadata?.latency_avg_ms,
          latencyP95: data.metadata?.latency_p95_ms,
          latencyP99: data.metadata?.latency_p99_ms,
          turnCount: data.metadata?.turn_count,
          userTurnCount: data.metadata?.user_turn_count,
          agentTurnCount: data.metadata?.agent_turn_count,
          interruptionCount: data.metadata?.interruption_count,
        },
        analysis: data.analysis ? {
          evaluationCriteria: data.analysis.evaluation_criteria_results,
          dataCollection: data.analysis.data_collection_results,
          callSuccessful: data.analysis.call_successful,
          transcriptSummary: data.analysis.transcript_summary,
        } : null,
      },
    });
  } catch (error: any) {
    console.error('[analytics] ElevenLabs conversation detail error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/analytics/conversations/:id/feedback
 * 
 * Send feedback (like/dislike) for a conversation to ElevenLabs.
 * Body: { feedback: 'like' | 'dislike' }
 */
analyticsRouter.post('/conversations/:id/feedback', async (req, res) => {
  try {
    const { feedback } = req.body;
    if (!feedback || !['like', 'dislike'].includes(feedback)) {
      res.status(400).json({ success: false, error: 'feedback must be "like" or "dislike"' });
      return;
    }

    const config = getPlatformConfig();
    const apiKey = config.elevenLabs?.apiKey;
    if (!apiKey) {
      res.status(500).json({ success: false, error: 'ElevenLabs API key not configured' });
      return;
    }

    const url = `https://api.elevenlabs.io/v1/convai/conversations/${req.params.id}/feedback`;
    const result = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ feedback }),
    });

    if (!result.ok) {
      const text = await result.text();
      throw new Error(`ElevenLabs API ${result.status}: ${text}`);
    }

    res.json({ success: true, feedback });
  } catch (error: any) {
    console.error('[analytics] ElevenLabs feedback error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/conversations/:id/audio
 * 
 * Proxy conversation audio recording from ElevenLabs.
 */
analyticsRouter.get('/conversations/:id/audio', async (req, res) => {
  try {
    const config = getPlatformConfig();
    const apiKey = config.elevenLabs?.apiKey;
    if (!apiKey) {
      res.status(500).json({ success: false, error: 'ElevenLabs API key not configured' });
      return;
    }

    const url = `https://api.elevenlabs.io/v1/convai/conversations/${req.params.id}/audio`;
    const result = await fetch(url, {
      headers: { 'xi-api-key': apiKey },
    });

    if (!result.ok) {
      const text = await result.text();
      throw new Error(`ElevenLabs API ${result.status}: ${text}`);
    }

    // Stream audio through
    res.setHeader('Content-Type', result.headers.get('content-type') || 'audio/mpeg');
    const arrayBuffer = await result.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error('[analytics] ElevenLabs audio error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/escalation-history
 * 
 * Get current escalation queue with full details.
 */
analyticsRouter.get('/escalation-history', (_req, res) => {
  const queue = getQueue();
  const stats = getQueueStats();
  
  res.json({
    success: true,
    data: {
      queue: queue.map(e => ({
        id: e.id,
        channel: e.channel,
        conversationId: e.conversationId,
        contactPhone: e.contactPhone,
        contactName: e.contactName,
        reason: e.reason,
        urgency: e.urgency,
        department: e.department,
        lastMessage: e.lastMessage,
        status: e.status,
        assignedTo: e.assignedTo,
        createdAt: e.createdAt,
        resolvedAt: e.resolvedAt,
        waitMinutes: Math.round((Date.now() - e.createdAt.getTime()) / 60000),
      })),
      stats,
    },
  });
});

// ============================================================================
// REAL-TIME STATS
// ============================================================================

/**
 * GET /api/analytics/realtime
 * 
 * Get real-time dashboard stats (no database required)
 */
analyticsRouter.get('/realtime', (_req, res) => {
  const summary = metricsCollector.getSummary();
  
  res.json({
    success: true,
    data: {
      ...summary,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * GET /api/analytics/active
 * 
 * Get currently active conversations
 */
analyticsRouter.get('/active', (_req, res) => {
  const active = metricsCollector.getActiveConversations();
  
  res.json({
    success: true,
    data: {
      count: active.length,
      conversations: active.map(c => ({
        id: c.id,
        channel: c.channel,
        startedAt: c.startedAt,
        durationSeconds: Math.round((Date.now() - c.startedAt.getTime()) / 1000),
        messageCount: c.messageCount,
        industry: c.industry,
      })),
    },
  });
});

/**
 * GET /api/analytics/recent
 * 
 * Get recent completed conversations
 */
analyticsRouter.get('/recent', (req, res) => {
  const limitParam = req.query.limit;
  const limit = Math.min(parseInt(limitParam as string) || 20, 100);
  const recent = metricsCollector.getRecentConversations(limit);
  
  res.json({
    success: true,
    data: {
      count: recent.length,
      conversations: recent.map(c => ({
        id: c.id,
        channel: c.channel,
        status: c.status,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        durationSeconds: c.durationSeconds,
        messageCount: c.messageCount,
        toolCallCount: c.toolCallCount,
        endReason: c.endReason,
        industry: c.industry,
      })),
    },
  });
});

// ============================================================================
// CONVERSATION LIFECYCLE (called by other routes)
// ============================================================================

/**
 * POST /api/analytics/conversation/start
 * 
 * Record a new conversation starting
 */
analyticsRouter.post('/conversation/start', async (req, res) => {
  const { conversationId, sessionId, channel, industry, conversationMode, metadata } = req.body;
  
  if (!conversationId || !sessionId) {
    res.status(400).json({
      success: false,
      error: 'conversationId and sessionId are required',
    });
    return;
  }
  
  const record = metricsCollector.startConversation({
    conversationId,
    sessionId,
    channel: (channel as ConversationChannel) || 'web',
    industry,
    conversationMode,
    metadata,
  });
  
  // Persist to database if available
  const prisma = await getDatabase();
  if (prisma) {
    prisma.conversationLog.create({
      data: {
        id: conversationId,
        tenantId,
        sessionId,
        channel: channel || 'web',
        status: 'active',
        startedAt: record.startedAt,
        industry,
        conversationMode,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    }).catch(err => console.error('[analytics] Failed to persist conversation start:', err));
  }
  
  res.json({
    success: true,
    data: { conversationId, startedAt: record.startedAt },
  });
});

/**
 * POST /api/analytics/conversation/message
 * 
 * Record a message in a conversation
 */
analyticsRouter.post('/conversation/message', (req, res) => {
  const { conversationId, role } = req.body;
  
  if (!conversationId || !role) {
    res.status(400).json({
      success: false,
      error: 'conversationId and role are required',
    });
    return;
  }
  
  metricsCollector.recordMessage(conversationId, role);
  
  res.json({ success: true });
});

/**
 * POST /api/analytics/conversation/tool
 * 
 * Record a tool call in a conversation
 */
analyticsRouter.post('/conversation/tool', (req, res) => {
  const { conversationId } = req.body;
  
  if (!conversationId) {
    res.status(400).json({
      success: false,
      error: 'conversationId is required',
    });
    return;
  }
  
  metricsCollector.recordToolCall(conversationId);
  
  res.json({ success: true });
});

/**
 * POST /api/analytics/conversation/end
 * 
 * Record a conversation ending
 */
analyticsRouter.post('/conversation/end', async (req, res) => {
  const { conversationId, endReason, tokensUsed } = req.body;
  
  if (!conversationId) {
    res.status(400).json({
      success: false,
      error: 'conversationId is required',
    });
    return;
  }
  
  const record = metricsCollector.endConversation(
    conversationId,
    endReason || 'user_ended',
    tokensUsed
  );
  
  if (!record) {
    res.status(404).json({
      success: false,
      error: 'Conversation not found',
    });
    return;
  }
  
  // Persist to database if available
  const prisma = await getDatabase();
  if (prisma) {
    prisma.conversationLog.update({
      where: { id: conversationId },
      data: {
        status: record.status,
        endedAt: record.endedAt,
        durationSeconds: record.durationSeconds,
        messageCount: record.messageCount,
        userMessageCount: record.userMessageCount,
        agentMessageCount: record.agentMessageCount,
        toolCallCount: record.toolCallCount,
        tokensUsed: record.tokensUsed,
        estimatedCost: record.estimatedCost,
        endReason: record.endReason,
      },
    }).catch(err => console.error('[analytics] Failed to persist conversation end:', err));
  }
  
  res.json({
    success: true,
    data: {
      conversationId,
      status: record.status,
      durationSeconds: record.durationSeconds,
      messageCount: record.messageCount,
      endReason: record.endReason,
    },
  });
});

// ============================================================================
// DASHBOARD DATA
// ============================================================================

/**
 * Helper: map ElevenLabs conversation_initiation_source to channel key.
 * Web chat conversations are split into web_text and web_voice based on has_audio.
 */
function mapSourceToChannel(source: string | undefined | null, hasAudio?: boolean): string {
  if (source === 'twilio_phone_call' || source === 'phone') return 'voice';
  if (source === 'twilio_sms' || source === 'sms') return 'sms';
  if (source === 'whatsapp') return 'whatsapp';
  // Web chat — partition by audio
  return hasAudio ? 'web_voice' : 'web_text';
}

/**
 * Helper: map ElevenLabs conversation status + call_successful to a UI status.
 */
function mapConversationStatus(status: string, callSuccessful: string | null): string {
  if (status === 'processing' || status === 'in-progress') return 'active';
  if (status === 'errored' || status === 'error') return 'error';
  // status === 'done'
  if (callSuccessful === 'failure') return 'abandoned';
  return 'completed';
}

/**
 * GET /api/analytics/dashboard
 * 
 * Get comprehensive dashboard data from ElevenLabs Conversations API.
 * Falls back to empty state if agent is not configured.
 * 
 * Query params:
 *   range: 'today' | 'week' | '2weeks' | 'month' | '30days' (default: today)
 *   date:  'YYYY-MM-DD' — specific day (overrides range)
 */
analyticsRouter.get('/dashboard', async (req, res) => {
  try {
    const config = getPlatformConfig();
    const agentId = config.elevenLabs?.agentId;

    if (!agentId) {
      // Return empty dashboard when not configured
      res.json({
        success: true,
        data: {
          realtime: { activeConversations: 0, todayTotal: 0, todayCompleted: 0, todayAbandoned: 0, avgDuration: 0, avgMessages: 0 },
          breakdown: { byChannel: { web_text: 0, web_voice: 0, voice: 0, whatsapp: 0, sms: 0 }, byEndReason: [] },
          recentConversations: [],
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Calculate time range
    const range = (req.query.range as string) || 'today';
    const customDate = req.query.date as string | undefined;
    let startAfter: number;
    let endBefore: number | undefined;

    if (customDate && /^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
      const dayStart = new Date(customDate + 'T00:00:00');
      const dayEnd = new Date(customDate + 'T23:59:59');
      startAfter = Math.floor(dayStart.getTime() / 1000);
      endBefore = Math.floor(dayEnd.getTime() / 1000);
    } else {
      switch (range) {
        case 'week': {
          const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0,0,0,0);
          startAfter = Math.floor(d.getTime() / 1000);
          break;
        }
        case '2weeks': {
          const d = new Date(); d.setDate(d.getDate() - 14); d.setHours(0,0,0,0);
          startAfter = Math.floor(d.getTime() / 1000);
          break;
        }
        case 'month': {
          const d = new Date(); d.setDate(1); d.setHours(0,0,0,0);
          startAfter = Math.floor(d.getTime() / 1000);
          break;
        }
        case '30days': {
          const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0);
          startAfter = Math.floor(d.getTime() / 1000);
          break;
        }
        default: { // 'today'
          const d = new Date(); d.setHours(0,0,0,0);
          startAfter = Math.floor(d.getTime() / 1000);
        }
      }
    }

    // Fetch from ElevenLabs (paginate)
    const allConversations: any[] = [];
    let cursor: string | undefined;
    let hasMore = true;
    let page = 0;

    while (hasMore && page < 10) {
      const params: Record<string, string> = {
        agent_id: agentId,
        call_start_after_unix: startAfter.toString(),
        page_size: '100',
      };
      if (endBefore) params.call_start_before_unix = endBefore.toString();
      if (cursor) params.cursor = cursor;

      const data = await fetchElevenLabs('/v1/convai/conversations', params);
      const conversations = data.conversations || [];
      allConversations.push(...conversations);
      hasMore = data.has_more === true;
      cursor = data.next_cursor || undefined;
      page++;
    }

    // Compute metrics
    const total = allConversations.length;
    let totalDuration = 0;
    let totalMessages = 0;
    let completed = 0;
    let abandoned = 0;
    const byChannel: Record<string, number> = { web_text: 0, web_voice: 0, voice: 0, whatsapp: 0, sms: 0 };
    const endReasons: Record<string, number> = {};

    for (const c of allConversations) {
      totalDuration += c.call_duration_secs || 0;
      totalMessages += c.message_count || 0;

      // Tally completed / abandoned
      const uiStatus = mapConversationStatus(c.status, c.call_successful);
      if (uiStatus === 'completed') completed++;
      else if (uiStatus === 'abandoned' || uiStatus === 'error') abandoned++;

      // Channel breakdown
      const ch = mapSourceToChannel(c.conversation_initiation_source, !!c.has_audio);
      byChannel[ch] = (byChannel[ch] || 0) + 1;

      // Resolution breakdown
      const reason = c.call_successful || 'unknown';
      endReasons[reason] = (endReasons[reason] || 0) + 1;
    }

    // Active conversations from in-memory (real-time WebSocket sessions)
    const active = metricsCollector.getActiveConversations();

    res.json({
      success: true,
      data: {
        realtime: {
          activeConversations: active.length,
          todayTotal: total,
          todayCompleted: completed,
          todayAbandoned: abandoned,
          avgDuration: total > 0 ? Math.round(totalDuration / total) : 0,
          avgMessages: total > 0 ? Math.round((totalMessages / total) * 10) / 10 : 0,
        },
        breakdown: {
          byChannel,
          byEndReason: Object.entries(endReasons).map(([reason, count]) => ({ reason, count })),
        },
        recentConversations: allConversations.slice(0, 20).map(c => ({
          id: c.conversation_id,
          channel: mapSourceToChannel(c.conversation_initiation_source, !!c.has_audio),
          status: mapConversationStatus(c.status, c.call_successful),
          duration: c.call_duration_secs || 0,
          messages: c.message_count || 0,
          endReason: c.call_successful || '',
          summary: c.transcript_summary || c.call_summary_title || null,
          hasAudio: !!c.has_audio,
          time: c.start_time_unix_secs
            ? new Date(c.start_time_unix_secs * 1000).toISOString()
            : new Date().toISOString(),
        })),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[analytics] Dashboard error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});
