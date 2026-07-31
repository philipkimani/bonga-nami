/**
 * CANONICAL PAYMENT TYPES (FROZEN)
 * 
 * These types are universal across ALL payment providers and ALL domains:
 * - Ecommerce (product purchases)
 * - Hotels (room bookings)
 * - Hospitals (appointment payments)
 * - Subscriptions (recurring payments)
 * - Wallets (top-ups)
 * 
 * DESIGN PRINCIPLES:
 * ✅ Payment-method agnostic (works for MPesa, Stripe, PayPal, etc.)
 * ✅ Domain-agnostic (no knowledge of carts, products, bookings)
 * ✅ Minimal surface area (only what's needed for payment)
 * ✅ Future-proof (stable for years)
 */

/**
 * Supported payment methods
 * 
 * Each method maps to a different backend implementation
 */
export type PaymentMethod =
  | "mpesa"
  | "card"

/**
 * Payment request structure
 * 
 * This is what ANY domain sends to request payment
 */
export interface PaymentRequest {
  /** Amount to charge (in smallest currency unit, e.g., cents for USD, shillings for KES) */
  amount: number
  
  /** Currency code (ISO 4217: USD, KES, EUR, etc.) */
  currency: string
  
  /** Reference ID linking payment to the order/booking/cart */
  reference: string
  
  /** Human-readable description of what's being paid for */
  description?: string
  
  /** Customer information (varies by payment method) */
  customer: {
    /** Phone number (required for MPesa) */
    phone?: string
    
    /** Email address (required for card payments) */
    email?: string
  }
}

/**
 * Payment result structure
 * 
 * This is what the payments backend returns
 */
export interface PaymentResult {
  /** Payment status */
  status: "pending" | "success" | "failed"
  
  /** Provider's transaction reference (for tracking/reconciliation) */
  providerReference?: string
  
  /** Human-readable message to show user */
  message: string
}
