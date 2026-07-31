/**
 * Mock Payments Backend
 * 
 * A fully functional in-memory implementation for:
 * - Demos
 * - Testing
 * - Development
 * - UI prototyping
 * 
 * NO external services. NO API keys. NO risk.
 * 
 * This proves the architecture works before connecting real payment providers.
 */

import { PaymentsBackend } from "./payments-backend.js"
import { PaymentRequest, PaymentResult, PaymentMethod } from "../types.js"

export class MockPaymentsBackend implements PaymentsBackend {
  async initiate(
    method: PaymentMethod,
    request: PaymentRequest
  ): Promise<PaymentResult> {
    // Simulate processing delay (realistic UX)
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Log payment details for debugging
    console.log('[payments] Mock payment initiated:', {
      method,
      amount: request.amount,
      currency: request.currency,
      reference: request.reference,
      customer: request.customer
    })

    // Always succeed in mock mode
    return {
      status: "success",
      providerReference: `mock_tx_${Date.now()}`,
      message: `✅ Payment successful (mock)\n\n${request.amount} ${request.currency} paid via ${method}`
    }
  }
}
