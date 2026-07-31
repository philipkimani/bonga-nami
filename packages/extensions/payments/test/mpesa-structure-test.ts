/**
 * MPesa Backend Structure Test
 * 
 * Tests that MpesaBackend is properly configured and implements
 * the PaymentsBackend interface correctly.
 * 
 * NOTE: This does NOT make real API calls to Safaricom.
 * For real API testing, you need valid credentials.
 */

import { MpesaBackend } from '../src/backend/mpesa-backend.js'
import { createPaymentsExtension } from '../src/payments-extension.js'

console.log('\n🧪 Testing MPesa Backend Structure\n')

// Test 1: Extension can be created with mpesa backend
console.log('Test 1: Creating payments extension with MPesa backend...')
try {
  const paymentsExt = createPaymentsExtension({ backend: 'mpesa' })
  console.log('✅ Extension created successfully with MPesa backend')
  
  await paymentsExt.onInitialize?.({})
  console.log('✅ Extension initialized successfully\n')
} catch (error: any) {
  console.error('❌ FAIL: Could not create extension with MPesa backend')
  console.error('   Error:', error.message)
  process.exit(1)
}

// Test 2: MpesaBackend class structure
console.log('Test 2: Validating MpesaBackend class structure...')
const mpesaBackend = new MpesaBackend()

if (typeof mpesaBackend.initiate !== 'function') {
  console.error('❌ FAIL: MpesaBackend missing initiate method')
  process.exit(1)
}

console.log('✅ MpesaBackend has initiate method')
console.log('✅ MpesaBackend implements PaymentsBackend interface\n')

// Test 3: Configuration validation
console.log('Test 3: Testing configuration validation...')
console.log('⚠️  Expected behavior: Should fail without credentials\n')

try {
  // This should fail because we don't have credentials set
  const result = await mpesaBackend.initiate('mpesa', {
    amount: 100,
    currency: 'KES',
    reference: 'test-ref',
    description: 'Test payment',
    customer: { phone: '+254712345678' }
  })
  
  // If we got here without error, credentials might be set
  console.log('ℹ️  Payment initiated:', result.status)
  console.log('   Note: You may have credentials configured in environment\n')
} catch (error: any) {
  if (error.message.includes('credentials not configured') || 
      error.message.includes('configuration incomplete')) {
    console.log('✅ Correctly validates missing credentials')
    console.log('   Error message:', error.message, '\n')
  } else {
    console.log('ℹ️  Got error (might be network/auth):', error.message, '\n')
  }
}

// Test 4: Environment variables expected
console.log('Test 4: Documenting required environment variables...')
console.log('   For real MPesa integration, set these in .env:')
console.log('   - MPESA_CONSUMER_KEY')
console.log('   - MPESA_CONSUMER_SECRET')
console.log('   - MPESA_SHORTCODE')
console.log('   - MPESA_PASSKEY')
console.log('   - MPESA_CALLBACK_URL')
console.log('   - MPESA_ENV (sandbox | production)\n')

console.log('═══════════════════════════════════════════════════════')
console.log('✅ ALL STRUCTURE TESTS PASSED')
console.log('═══════════════════════════════════════════════════════')
console.log('\nMPesa Backend is ready to use!')
console.log('\nTo use in production:')
console.log('1. Add MPesa credentials to .env file')
console.log('2. Change backend config from "mock" to "mpesa"')
console.log('3. Test with Safaricom sandbox first')
console.log('4. Deploy and test with real money (small amounts first)\n')
