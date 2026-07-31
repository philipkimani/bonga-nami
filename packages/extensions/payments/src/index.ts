/**
 * Payments Extension - Public API
 * 
 * This is what clients import to use the payments capability.
 */

// Main extension factory
export { createPaymentsExtension, getLatestPaymentResult, recordMpesaCallback } from './payments-extension.js'

// Types (for consumers to construct payment requests)
export type { PaymentMethod, PaymentRequest, PaymentResult } from './types.js'

// Backend interface (for implementing new providers)
export type { PaymentsBackend } from './backend/payments-backend.js'

// Backend implementations
export { MockPaymentsBackend } from './backend/mock-backend.js'
export { MpesaBackend } from './backend/mpesa-backend.js'
