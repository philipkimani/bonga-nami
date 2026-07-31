/**
 * MPesa Backend (Daraja API)
 * 
 * Implements STK Push for M-Pesa payments via Safaricom Daraja API.
 * 
 * Supports:
 * - ✅ Payment initiation (STK Push)
 * - ✅ Sandbox and production environments
 * - ✅ Pending status (callback handling comes later)
 * 
 * Does NOT support (yet):
 * - ❌ Refunds
 * - ❌ Subscriptions
 * - ❌ Reconciliation
 * 
 * Environment Variables Required:
 * - MPESA_CONSUMER_KEY
 * - MPESA_CONSUMER_SECRET
 * - MPESA_SHORTCODE
 * - MPESA_PASSKEY
 * - MPESA_CALLBACK_URL
 * - MPESA_ENV (sandbox | production)
 */

import axios from "axios"
import { PaymentsBackend } from "./payments-backend.js"
import { PaymentMethod, PaymentRequest, PaymentResult } from "../types.js"

export class MpesaBackend implements PaymentsBackend {
  private token: string | null = null
  private tokenExpiry: number | null = null

  /**
   * Get OAuth access token from Daraja
   * Caches token until expiry
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token
    }

    const consumerKey = process.env.MPESA_CONSUMER_KEY
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET
    const env = process.env.MPESA_ENV || 'sandbox'

    if (!consumerKey || !consumerSecret) {
      throw new Error('MPesa credentials not configured. Set MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET')
    }

    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")

    const baseUrl = env === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke'

    const res = await axios.get(
      `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${auth}` } }
    )

    this.token = res.data.access_token
    // Tokens expire after ~1 hour, cache for 50 minutes to be safe
    this.tokenExpiry = Date.now() + (50 * 60 * 1000)
    
    if (!this.token) {
      throw new Error('Failed to obtain MPesa access token')
    }
    
    return this.token
  }

  /**
   * Initiate MPesa STK Push payment
   */
  async initiate(
    method: PaymentMethod,
    request: PaymentRequest
  ): Promise<PaymentResult> {
    if (method !== "mpesa") {
      throw new Error(`Unsupported payment method: ${method}`)
    }

    const shortcode = process.env.MPESA_SHORTCODE
    const passkey = process.env.MPESA_PASSKEY
    const callbackUrl = process.env.MPESA_CALLBACK_URL
    const env = process.env.MPESA_ENV || 'sandbox'

    // Validate configuration
    if (!shortcode || !passkey || !callbackUrl) {
      throw new Error('MPesa configuration incomplete. Set MPESA_SHORTCODE, MPESA_PASSKEY, and MPESA_CALLBACK_URL')
    }

    // Validate phone number
    if (!request.customer.phone) {
      throw new Error('Customer phone number is required for MPesa payments')
    }

    const token = await this.getAccessToken()
    
    // Generate timestamp (YYYYMMDDHHmmss)
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14)

    // Generate password (Base64 of Shortcode + Passkey + Timestamp)
    const password = Buffer.from(
      `${shortcode}${passkey}${timestamp}`
    ).toString("base64")

    const baseUrl = env === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke'

    try {
      const res = await axios.post(
        `${baseUrl}/mpesa/stkpush/v1/processrequest`,
        {
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: request.amount,
          PartyA: request.customer.phone,
          PartyB: shortcode,
          PhoneNumber: request.customer.phone,
          CallBackURL: callbackUrl,
          AccountReference: request.reference,
          TransactionDesc: request.description ?? "Payment"
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      console.log('[mpesa] STK Push initiated:', {
        checkoutRequestId: res.data.CheckoutRequestID,
        merchantRequestId: res.data.MerchantRequestID,
        responseCode: res.data.ResponseCode
      })

      return {
        status: "pending",
        providerReference: res.data.CheckoutRequestID,
        message: "📲 Please confirm the MPesa prompt on your phone."
      }
    } catch (error: any) {
      console.error('[mpesa] STK Push failed:', error.response?.data || error.message)
      
      return {
        status: "failed",
        message: `Payment initiation failed: ${error.response?.data?.errorMessage || error.message}`
      }
    }
  }
}
