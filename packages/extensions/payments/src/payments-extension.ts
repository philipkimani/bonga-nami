/**
 * Payments Extension
 * 
 * This extension:
 * - ✅ Hooks into the chatbot engine
 * - ✅ Connects to a swappable PaymentsBackend
 * - ✅ Handles payment intents from ANY domain (ecommerce, hotels, hospitals)
 * - ✅ Returns payment status to the user
 * 
 * This is a CAPABILITY, not a feature.
 * Any domain can request payment through this extension.
 */

import type { ChatbotExtensionV1, ExtensionContext } from '@platform/core'
import { MockPaymentsBackend } from './backend/mock-backend.js'
import { MpesaBackend } from './backend/mpesa-backend.js'
import type { PaymentsBackend } from './backend/payments-backend.js'
import type { PaymentResult } from './types.js'

// 5A.5 — Simple env toggle for local testing
const backend: PaymentsBackend =
  process.env.USE_MOCK_PAYMENTS === 'true'
    ? new MockPaymentsBackend()
    : new MpesaBackend()

console.log('[payments] Backend selected:', process.env.USE_MOCK_PAYMENTS === 'true' ? 'mock' : 'mpesa')

const paymentResultByProviderReference = new Map<string, PaymentResult>()
const latestProviderReferenceBySessionId = new Map<string, string>()

export function getLatestPaymentResult(sessionId: string): PaymentResult | undefined {
  const providerReference = latestProviderReferenceBySessionId.get(sessionId)
  if (!providerReference) return undefined
  return paymentResultByProviderReference.get(providerReference)
}

export function recordMpesaCallback(callbackBody: any): PaymentResult | undefined {
  const stkCallback = callbackBody?.Body?.stkCallback
  const checkoutRequestId: string | undefined = stkCallback?.CheckoutRequestID
  const resultCode: number | undefined = stkCallback?.ResultCode
  const resultDesc: string | undefined = stkCallback?.ResultDesc

  if (!checkoutRequestId || typeof resultCode !== 'number') return undefined

  const result: PaymentResult = {
    status: resultCode === 0 ? 'success' : 'failed',
    providerReference: checkoutRequestId,
    message:
      resultCode === 0
        ? '✅ MPesa payment confirmed.'
        : `❌ MPesa payment failed${resultDesc ? `: ${resultDesc}` : ''}`
  }

  paymentResultByProviderReference.set(checkoutRequestId, result)
  return result
}

/**
 * Create Payments Extension
 * 
 * Uses module-level backend based on USE_MOCK_PAYMENTS env var.
 * 
 * Usage:
 * ```ts
 * const paymentsExt = createPaymentsExtension()
 * engine.registerExtension(paymentsExt)
 * ```
 */
export function createPaymentsExtension(): ChatbotExtensionV1 {
  // Uses the module-level backend (toggled by USE_MOCK_PAYMENTS env var)

  return {
    async onInitialize() {
      console.log('[payments] ✅ Extension initialized')
    },

    async beforeResponse(input: string, context: ExtensionContext) {
      // Check if another extension (ecommerce, hotels, etc.) emitted a payment intent
      if (context.intent?.type === 'payments.initiate') {
        console.log('[payments] 💳 Payment intent received:', context.intent)
        
        const { method, paymentRequest } = context.intent
        
        // Validate payment request
        if (!method || !paymentRequest) {
          console.error('[payments] ❌ Invalid payment intent: missing method or paymentRequest')
          return
        }

        try {
          // Call the payments backend (mock, mpesa, stripe, etc.)
          const result = await backend.initiate(method, paymentRequest)
          
          console.log('[payments] ✅ Payment result:', result)
          
          // Store payment result in context for response
          // The chat route will pick this up and return it to the user
          context.intent.paymentResult = result

          if (result.providerReference && context.sessionId) {
            latestProviderReferenceBySessionId.set(context.sessionId, result.providerReference)
            paymentResultByProviderReference.set(result.providerReference, result)
          }
          
        } catch (error) {
          console.error('[payments] ❌ Payment failed:', error)
          context.intent.paymentResult = {
            status: 'failed',
            message: 'Payment processing failed. Please try again.'
          }
        }
      }
    },

    async afterResponse(output: string, context: ExtensionContext) {
      // Hook for future enhancement (e.g., payment confirmations)
      console.log('[payments] Response processed for session:', context.sessionId)
    }
  }
}
