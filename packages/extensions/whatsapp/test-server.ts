/**
 * WhatsApp Extension - Test Server
 * 
 * Quick test server to validate WhatsApp integration.
 * Run with: tsx test-server.ts
 */

import express from 'express';
import dotenv from 'dotenv';
import { 
  whatsappWebhook, 
  whatsappWebhookVerify,
  setMessageHandler,
  sendWhatsAppText
} from './src/index.js';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

// Configure message handler
setMessageHandler(async ({ tenantId, userId, channel, text }) => {
  console.log('📩 Received message:', { tenantId, userId, channel, text });
  
  // Simple command handling
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('hello') || lowerText.includes('hi')) {
    return '👋 Hello! I\'m a chatbot powered by WhatsApp. How can I help you?';
  }
  
  if (lowerText.includes('help')) {
    return `
*Commands Available:* 📋

• hello - Greet the bot
• help - Show this message
• time - Get current time
• echo [text] - Echo your message
• test - Run a test

Try one!
    `.trim();
  }
  
  if (lowerText.includes('time')) {
    return `Current time: ${new Date().toLocaleTimeString()}`;
  }
  
  if (lowerText.startsWith('echo ')) {
    return text.substring(5);
  }
  
  if (lowerText.includes('test')) {
    return '✅ Test successful! WhatsApp integration is working.';
  }
  
  // Default response
  return `You said: "${text}"\n\nType *help* to see available commands.`;
});

// WhatsApp webhook endpoints
app.get('/webhooks/whatsapp', whatsappWebhookVerify);
app.post('/webhooks/whatsapp', whatsappWebhook);

// Test endpoint to send messages manually
app.post('/api/send-test', async (req, res) => {
  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ error: 'Missing to or message' });
    }
    
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    if (!phoneNumberId || !accessToken) {
      return res.status(500).json({ error: 'Missing WhatsApp configuration' });
    }
    
    const messageId = await sendWhatsAppText(
      phoneNumberId,
      to,
      message,
      accessToken
    );
    
    res.json({ 
      success: true, 
      messageId,
      to,
      message 
    });
  } catch (error: any) {
    console.error('Send test error:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    whatsapp: {
      configured: !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'set' : 'missing',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN ? 'set' : 'missing',
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ? 'set' : 'missing',
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>WhatsApp Test Server</title></head>
      <body>
        <h1>WhatsApp Extension Test Server</h1>
        <h2>Status: Running ✅</h2>
        
        <h3>Endpoints:</h3>
        <ul>
          <li><a href="/health">GET /health</a> - Health check</li>
          <li>GET /webhooks/whatsapp - Webhook verification</li>
          <li>POST /webhooks/whatsapp - Receive messages</li>
          <li>POST /api/send-test - Send test message</li>
        </ul>
        
        <h3>Configuration:</h3>
        <ul>
          <li>Phone Number ID: ${process.env.WHATSAPP_PHONE_NUMBER_ID ? '✅ Set' : '❌ Missing'}</li>
          <li>Access Token: ${process.env.WHATSAPP_ACCESS_TOKEN ? '✅ Set' : '❌ Missing'}</li>
          <li>Verify Token: ${process.env.WHATSAPP_VERIFY_TOKEN ? '✅ Set' : '❌ Missing'}</li>
          <li>Tenant ID: ${process.env.TENANT_ID || 'Not set'}</li>
        </ul>
        
        <h3>Quick Test:</h3>
        <pre>
# Test webhook verification
curl "http://localhost:${PORT}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${process.env.WHATSAPP_VERIFY_TOKEN || 'YOUR_TOKEN'}&hub.challenge=TEST"

# Send test message
curl -X POST http://localhost:${PORT}/api/send-test \\
  -H "Content-Type: application/json" \\
  -d '{"to":"1234567890","message":"Hello from test server!"}'
        </pre>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('🚀 WhatsApp Test Server Started');
  console.log('=====================================');
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Webhook: http://localhost:${PORT}/webhooks/whatsapp`);
  console.log('=====================================');
  console.log('Configuration:');
  console.log(`  Phone Number ID: ${process.env.WHATSAPP_PHONE_NUMBER_ID ? '✅' : '❌'}`);
  console.log(`  Access Token: ${process.env.WHATSAPP_ACCESS_TOKEN ? '✅' : '❌'}`);
  console.log(`  Verify Token: ${process.env.WHATSAPP_VERIFY_TOKEN ? '✅' : '❌'}`);
  console.log(`  Tenant ID: ${process.env.TENANT_ID || 'Not set'}`);
  console.log('=====================================');
  console.log('📱 Ready to receive WhatsApp messages!');
  console.log('💡 Use ngrok to expose this server for testing');
});
