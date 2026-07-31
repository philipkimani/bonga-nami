/**
 * Example: WhatsApp Integration with Chatbot Platform
 * 
 * This example shows how to integrate the WhatsApp extension
 * with the chatbot platform.
 */

import express from 'express';
import { 
  whatsappWebhook, 
  whatsappWebhookVerify,
  setMessageHandler,
  registerTenantMapping,
  sendWhatsAppText,
  formatForWhatsApp
} from '@platform/whatsapp-extension';

// Example 1: Basic Setup
// ======================

const app = express();
app.use(express.json());

// WhatsApp webhook endpoints
app.get('/webhooks/whatsapp', whatsappWebhookVerify);
app.post('/webhooks/whatsapp', whatsappWebhook);

// Configure message handler
setMessageHandler(async ({ tenantId, userId, channel, text }) => {
  console.log(`Message from ${userId} (tenant: ${tenantId}): ${text}`);
  
  // Simple echo bot for demonstration
  return `You said: ${text}`;
  
  // In production, integrate with your chatbot engine:
  // const engine = getChatbotEngine(tenantId);
  // return await engine.processMessage(userId, text);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WhatsApp webhook listening on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhooks/whatsapp`);
});


// Example 2: Multi-Tenant Setup
// ==============================

// Register multiple clients with different WhatsApp numbers
registerTenantMapping({
  tenantId: 'restaurant-client',
  phoneNumberId: '123456789',
  accessToken: process.env.WHATSAPP_TOKEN_RESTAURANT!,
});

registerTenantMapping({
  tenantId: 'ecommerce-client',
  phoneNumberId: '987654321',
  accessToken: process.env.WHATSAPP_TOKEN_ECOMMERCE!,
});

// Message handler with tenant-specific logic
setMessageHandler(async ({ tenantId, userId, channel, text }) => {
  if (tenantId === 'restaurant-client') {
    // Restaurant-specific logic
    if (text.toLowerCase().includes('menu')) {
      return 'Our menu: Pizza 🍕, Burger 🍔, Pasta 🍝';
    }
  }
  
  if (tenantId === 'ecommerce-client') {
    // E-commerce-specific logic
    if (text.toLowerCase().includes('products')) {
      return 'Browse our products at: https://shop.example.com';
    }
  }
  
  return 'Hello! How can I help you today?';
});


// Example 3: Proactive Messaging
// ===============================

async function sendProactiveMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientNumber: string,
  message: string
) {
  const formatted = formatForWhatsApp(message);
  
  await sendWhatsAppText(
    phoneNumberId,
    recipientNumber,
    formatted,
    accessToken
  );
  
  console.log(`Sent proactive message to ${recipientNumber}`);
}

// Example: Send order confirmation
async function sendOrderConfirmation(orderDetails: any) {
  const message = `
*Order Confirmed! 🎉*

Order #${orderDetails.orderId}
Total: $${orderDetails.total}

Your order will be delivered in 30-45 minutes.

Track your order: ${orderDetails.trackingUrl}
  `.trim();

  await sendProactiveMessage(
    process.env.WHATSAPP_PHONE_NUMBER_ID!,
    process.env.WHATSAPP_ACCESS_TOKEN!,
    orderDetails.customerPhone,
    message
  );
}

// Example 5: Rich Responses
// ==========================

setMessageHandler(async ({ tenantId, userId, channel, text }) => {
  if (text.toLowerCase().includes('help')) {
    return `
*Welcome to our chatbot!* 👋

Here's what I can help you with:

• Check menu
• Place an order
• Track delivery
• Contact support

Just type what you need!
    `.trim();
  }
  
  if (text.toLowerCase().includes('menu')) {
    return `
*Our Menu* 🍽️

*Pizza* 🍕
1. Margherita - $12
2. Pepperoni - $14
3. Veggie - $13

*Burgers* 🍔
1. Classic - $10
2. Cheese - $11
3. Deluxe - $15

Reply with the item number to order!
    `.trim();
  }
  
  return 'I didn\'t understand that. Type *help* for options.';
});


// Example 6: Error Handling
// ==========================

setMessageHandler(async ({ tenantId, userId, channel, text }) => {
  try {
    // Your chatbot logic
    const response = await processChatMessage(text);
    return response;
  } catch (error) {
    console.error('Error processing message:', error);
    
    // Send friendly error message to user
    return 'Sorry, I encountered an error. Please try again or contact support.';
  }
});

// Example helper function
async function processChatMessage(text: string): Promise<string> {
  // Simulate chatbot processing
  await new Promise(resolve => setTimeout(resolve, 100));
  return `Processed: ${text}`;
}


// Example 7: Session Management
// ==============================

const userSessions = new Map<string, { step: string; data: any }>();

setMessageHandler(async ({ tenantId, userId, channel, text }) => {
  // Get or create session
  let session = userSessions.get(userId);
  
  if (!session) {
    session = { step: 'greeting', data: {} };
    userSessions.set(userId, session);
  }
  
  // Handle conversation flow
  if (session.step === 'greeting') {
    session.step = 'ask_name';
    return 'Hi! What\'s your name?';
  }
  
  if (session.step === 'ask_name') {
    session.data.name = text;
    session.step = 'ask_order';
    return `Nice to meet you, ${text}! What would you like to order?`;
  }
  
  if (session.step === 'ask_order') {
    session.data.order = text;
    session.step = 'complete';
    
    // Clear session after completion
    userSessions.delete(userId);
    
    return `Perfect! Your order for ${text} has been placed. We'll deliver it soon!`;
  }
  
  return 'Something went wrong. Let\'s start over!';
});
