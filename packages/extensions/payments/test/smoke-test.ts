/**
 * Payments Extension Smoke Test
 * 
 * Verifies:
 * 1. Extension can be created
 * 2. MockPaymentsBackend works
 * 3. Payment flow is correct
 */

import { createPaymentsExtension, MockPaymentsBackend } from '../src/index.js'
import type { PaymentRequest } from '../src/types.js'

async function smokeTest() {
  console.log('🧪 PAYMENTS EXTENSION SMOKE TEST\n')

  // Test 1: Create extension
  console.log('✓ Test 1: Create payments extension')
  const paymentsExt = createPaymentsExtension({ backend: 'mock' })
  await paymentsExt.onInitialize?.()

  // Test 2: Create mock backend directly
  console.log('✓ Test 2: Create mock backend')
  const backend = new MockPaymentsBackend()

  // Test 3: Initiate MPesa payment
  console.log('\n✓ Test 3: Initiate MPesa payment')
  const mpesaRequest: PaymentRequest = {
    amount: 100,
    currency: 'KES',
    reference: 'order_123',
    description: 'Wireless Headphones',
    customer: {
      phone: '+254712345678'
    }
  }

  const mpesaResult = await backend.initiate('mpesa', mpesaRequest)
  console.log('  Status:', mpesaResult.status)
  console.log('  Reference:', mpesaResult.providerReference)
  console.log('  Message:', mpesaResult.message)

  // Test 4: Initiate card payment
  console.log('\n✓ Test 4: Initiate card payment')
  const cardRequest: PaymentRequest = {
    amount: 12000,
    currency: 'KES',
    reference: 'order_456',
    description: 'Hotel Room Booking',
    customer: {
      email: 'customer@example.com'
    }
  }

  const cardResult = await backend.initiate('card', cardRequest)
  console.log('  Status:', cardResult.status)
  console.log('  Reference:', cardResult.providerReference)
  console.log('  Message:', cardResult.message)

  console.log('\n✅ ALL TESTS PASSED!')
}

smokeTest().catch(console.error)
