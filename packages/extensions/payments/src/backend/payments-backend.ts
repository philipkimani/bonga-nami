/**
 * PaymentsBackend Interface (THE MOAT)
 * 
 * THE STABLE CONTRACT between the payments extension and any payment provider.
 * 
 * This interface will survive for years.
 * MPesa, Stripe, PayPal, crypto wallets — all fit here.
 * 
 * IMPLEMENTATIONS:
 * - mock-backend.ts (testing, demos, no risk)
 * - mpesa-backend.ts (Safaricom MPesa STK Push)
 * - stripe-backend.ts (Stripe Payment Intents)
 * - paypal-backend.ts (PayPal Orders API)
 * - flutterwave-backend.ts (Flutterwave)
 * - razorpay-backend.ts (Razorpay for India)
 * 
 * KEY DESIGN PRINCIPLES:
 * ✅ Domain-agnostic (no knowledge of products, carts, bookings)
 * ✅ Provider-agnostic (any payment provider can implement)
 * ✅ Minimal surface area (one method: initiate)
 * ✅ Future-proof (stable contract)
 */

import { PaymentRequest, PaymentResult, PaymentMethod } from "../types.js"

export interface PaymentsBackend {
  /**
   * Initiate a payment
   * 
   * This method:
   * 1. Contacts the payment provider
   * 2. Initiates the payment flow (STK push, hosted checkout, etc.)
   * 3. Returns the immediate result (pending/success/failed)
   * 
   * For async flows (like MPesa STK Push):
   * - Returns status: "pending"
   * - Callbacks/webhooks handle final confirmation
   * 
   * For sync flows (like mock):
   * - Returns status: "success" or "failed" immediately
   * 
   * @param method - Payment method to use (mpesa, card, etc.)
   * @param request - Payment request details
   * @returns Payment result with status and message
   */
  initiate(
    method: PaymentMethod,
    request: PaymentRequest
  ): Promise<PaymentResult>
}
