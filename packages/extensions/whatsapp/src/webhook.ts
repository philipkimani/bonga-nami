/**
 * WhatsApp Extension - Webhook Handler
 * 
 * Handles inbound WhatsApp messages via Meta's webhook.
 * Processes messages and routes them to the appropriate tenant/client.
 */

import type { Request, Response } from 'express';
import { resolveTenantByPhoneNumberId, getAccessTokenForPhoneNumber } from './tenantResolver.js';
import { sendWhatsAppText, markMessageAsRead } from './sender.js';
import { formatForWhatsApp } from './formatter.js';
import type { WhatsAppMessage } from './types.js';

/**
 * Message handler function type
 * This should be implemented by the chatbot engine
 */
export type MessageHandler = (params: {
  tenantId: string;
  userId: string;
  channel: string;
  text: string;
}) => Promise<string | null>;

// Store the message handler (set by the engine)
let messageHandler: MessageHandler | null = null;

/**
 * Set the message handler for processing incoming messages
 * 
 * @param handler - Function to handle incoming messages
 */
export function setMessageHandler(handler: MessageHandler): void {
  messageHandler = handler;
}

/**
 * WhatsApp webhook verification handler
 * 
 * Meta sends a GET request to verify the webhook endpoint.
 * 
 * @param req - Express request
 * @param res - Express response
 */
export function whatsappWebhookVerify(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'default-verify-token';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    console.warn('❌ WhatsApp webhook verification failed');
    res.sendStatus(403);
  }
}

/**
 * WhatsApp webhook handler for incoming messages
 * 
 * Meta sends a POST request with message data.
 * 
 * @param req - Express request
 * @param res - Express response
 */
export async function whatsappWebhook(req: Request, res: Response): Promise<void> {
  try {
    // Extract message data from webhook payload
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // Handle status updates (delivered, read, etc.)
    if (value?.statuses) {
      // Log status updates but don't process them
      console.log('WhatsApp status update:', value.statuses);
      res.sendStatus(200);
      return;
    }

    // Extract message
    const message = value?.messages?.[0];
    
    if (!message) {
      // No message to process
      res.sendStatus(200);
      return;
    }

    // Only process text messages for now
    if (message.type !== 'text') {
      console.log(`Ignoring non-text message type: ${message.type}`);
      res.sendStatus(200);
      return;
    }

    // Extract metadata
    const phoneNumberId = value.metadata?.phone_number_id;
    const from = message.from;
    const text = message.text?.body;
    const messageId = message.id;

    if (!phoneNumberId || !from || !text) {
      console.warn('Missing required WhatsApp message fields');
      res.sendStatus(400);
      return;
    }

    // Resolve tenant from phone number ID
    const tenant = await resolveTenantByPhoneNumberId(phoneNumberId);
    
    if (!tenant) {
      console.warn(`No tenant found for phone number ID: ${phoneNumberId}`);
      res.sendStatus(403);
      return;
    }

    // Capability gate: Check if tenant has WhatsApp enabled
    if (!tenant.capabilities.includes('whatsapp')) {
      console.warn(`WhatsApp capability not enabled for tenant: ${tenant.tenantId}`);
      res.sendStatus(403);
      return;
    }

    // Get access token for sending responses
    const accessToken = await getAccessTokenForPhoneNumber(phoneNumberId);
    
    if (!accessToken) {
      console.error(`No access token found for phone number ID: ${phoneNumberId}`);
      res.sendStatus(500);
      return;
    }

    // Mark message as read (fire and forget)
    markMessageAsRead(phoneNumberId, messageId, accessToken).catch(console.warn);

    // ============================================================
    // PRODUCTION: Track inbound message for billing
    // ============================================================
    // await db.query(
    //   'INSERT INTO whatsapp_usage (tenant_id, direction) VALUES ($1, $2)',
    //   [tenant.tenantId, 'inbound']
    // );
    // ============================================================

    // Process message through chatbot engine
    if (!messageHandler) {
      console.error('Message handler not set! Call setMessageHandler() first.');
      res.sendStatus(500);
      return;
    }

    const response = await messageHandler({
      tenantId: tenant.tenantId,
      userId: from,
      channel: 'whatsapp',
      text,
    });

    // Send response back to user
    if (response) {
      const formattedResponse = formatForWhatsApp(response);
      await sendWhatsAppText(phoneNumberId, from, formattedResponse, accessToken);
      
      // ============================================================
      // PRODUCTION: Track outbound message for billing
      // ============================================================
      // await db.query(
      //   'INSERT INTO whatsapp_usage (tenant_id, direction) VALUES ($1, $2)',
      //   [tenant.tenantId, 'outbound']
      // );
      // ============================================================
    }

    // Always return 200 to acknowledge receipt
    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
    // Still return 200 to prevent Meta from retrying
    res.sendStatus(200);
  }
}

/**
 * Extract WhatsApp message from webhook payload
 * 
 * @param payload - Webhook payload from Meta
 * @returns Parsed WhatsApp message or null
 */
export function extractWhatsAppMessage(payload: any): WhatsAppMessage | null {
  try {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message || message.type !== 'text') {
      return null;
    }

    return {
      from: message.from,
      text: message.text.body,
      messageId: message.id,
      timestamp: message.timestamp,
    };
  } catch (error) {
    console.error('Failed to extract WhatsApp message:', error);
    return null;
  }
}
