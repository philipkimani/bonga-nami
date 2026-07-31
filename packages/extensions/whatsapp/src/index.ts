/**
 * WhatsApp Extension
 * 
 * Enables WhatsApp as a communication channel for the chatbot platform.
 * 
 * Features:
 * - Inbound message handling via Meta webhook
 * - Outbound message sending via WhatsApp Business API
 * - Multi-tenant support (multiple WhatsApp numbers)
 * - Message formatting for WhatsApp
 * - Automatic message splitting for long responses
 * 
 * USAGE:
 * ```ts
 * import { whatsappWebhook, whatsappWebhookVerify, setMessageHandler } from '@platform/whatsapp-extension'
 * 
 * // Set up webhook routes
 * app.get('/webhooks/whatsapp', whatsappWebhookVerify)
 * app.post('/webhooks/whatsapp', whatsappWebhook)
 * 
 * // Configure message handler
 * setMessageHandler(async ({ tenantId, userId, channel, text }) => {
 *   // Process message with chatbot engine
 *   return await chatbotEngine.handleMessage(tenantId, userId, text)
 * })
 * ```
 * 
 * SETUP:
 * 1. Create WhatsApp Business Account at business.facebook.com
 * 2. Get phone number ID and access token
 * 3. Set up webhook URL (this endpoint)
 * 4. Configure environment variables:
 *    - WHATSAPP_ACCESS_TOKEN
 *    - WHATSAPP_VERIFY_TOKEN
 *    - TENANT_ID (for single-tenant setup)
 */

export * from './types.js';
export * from './webhook.js';
export * from './sender.js';
export * from './formatter.js';
export * from './tenantResolver.js';
