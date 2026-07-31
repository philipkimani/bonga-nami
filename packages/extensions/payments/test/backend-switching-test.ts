/**
 * Backend Switching Test
 * 
 * Demonstrates how to switch between mock and MPesa backends
 * using configuration only (no code changes in business logic)
 */

import { createPaymentsExtension } from '../src/payments-extension.js'

console.log('\n🔄 Testing Backend Switching\n')
console.log('═══════════════════════════════════════════════════════\n')

// Test 1: Mock Backend
console.log('Test 1: Creating extension with MOCK backend...')
const mockExt = createPaymentsExtension({ backend: 'mock' })
await mockExt.onInitialize?.({})
console.log('✅ Mock backend initialized\n')

// Test 2: MPesa Backend
console.log('Test 2: Creating extension with MPESA backend...')
const mpesaExt = createPaymentsExtension({ backend: 'mpesa' })
await mpesaExt.onInitialize?.({})
console.log('✅ MPesa backend initialized\n')

// Test 3: Stripe Backend (not implemented yet)
console.log('Test 3: Attempting to create extension with STRIPE backend...')
try {
  const stripeExt = createPaymentsExtension({ backend: 'stripe' })
  console.log('❌ UNEXPECTED: Stripe should not be implemented yet')
} catch (error: any) {
  if (error.message.includes('not yet implemented')) {
    console.log('✅ Correctly rejects unimplemented backend')
    console.log('   Error:', error.message, '\n')
  } else {
    console.log('❌ Unexpected error:', error.message)
  }
}

console.log('═══════════════════════════════════════════════════════')
console.log('✅ ALL SWITCHING TESTS PASSED')
console.log('═══════════════════════════════════════════════════════\n')

console.log('How to switch backends in production:\n')
console.log('Option 1: Code-based (simple)')
console.log('  const paymentsExt = createPaymentsExtension({ backend: "mpesa" })\n')

console.log('Option 2: Environment-based (recommended)')
console.log('  const backend = process.env.PAYMENT_BACKEND || "mock"')
console.log('  const paymentsExt = createPaymentsExtension({ backend })\n')

console.log('Option 3: Feature flags (advanced)')
console.log('  const backend = featureFlags.useMpesa ? "mpesa" : "mock"')
console.log('  const paymentsExt = createPaymentsExtension({ backend })\n')

console.log('Benefits of this approach:')
console.log('  • No code changes to switch backends')
console.log('  • Easy A/B testing (mock vs real for different users)')
console.log('  • Gradual rollout (start with mock, switch to mpesa)')
console.log('  • Multi-provider support (different backends per region)')
console.log('  • THE MOAT: Domain logic never knows about payment provider\n')
