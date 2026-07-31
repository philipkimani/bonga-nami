/**
 * WhatsApp Extension - Message Sender
 * 
 * Handles outbound messages to WhatsApp using the WhatsApp Business API.
 */

import axios from 'axios';

const WHATSAPP_API_VERSION = 'v18.0';
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

/**
 * Send a text message via WhatsApp
 * 
 * @param phoneNumberId - WhatsApp Business Account phone number ID
 * @param to - Recipient's WhatsApp number (with country code, no +)
 * @param text - Message text to send
 * @param accessToken - WhatsApp Business API access token
 * @returns Message ID from WhatsApp
 */
export async function sendWhatsAppText(
  phoneNumberId: string,
  to: string,
  text: string,
  accessToken: string
): Promise<string> {
  try {
    const response = await axios.post(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.messages?.[0]?.id || 'unknown';
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('WhatsApp API error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      throw new Error(
        `Failed to send WhatsApp message: ${error.response?.data?.error?.message || error.message}`
      );
    }
    throw error;
  }
}

/**
 * Mark a message as read
 * 
 * @param phoneNumberId - WhatsApp Business Account phone number ID
 * @param messageId - Message ID to mark as read
 * @param accessToken - WhatsApp Business API access token
 */
export async function markMessageAsRead(
  phoneNumberId: string,
  messageId: string,
  accessToken: string
): Promise<void> {
  try {
    await axios.post(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    // Non-critical error - log and continue
    console.warn('Failed to mark message as read:', error);
  }
}

/**
 * Send a typing indicator
 * 
 * @param phoneNumberId - WhatsApp Business Account phone number ID
 * @param to - Recipient's WhatsApp number
 * @param accessToken - WhatsApp Business API access token
 */
export async function sendTypingIndicator(
  phoneNumberId: string,
  to: string,
  accessToken: string
): Promise<void> {
  try {
    // WhatsApp doesn't have a direct typing indicator API
    // This is a placeholder for future implementation
    // You could use reaction or other features as alternatives
    console.log(`Typing indicator would be sent to ${to}`);
  } catch (error) {
    console.warn('Failed to send typing indicator:', error);
  }
}
