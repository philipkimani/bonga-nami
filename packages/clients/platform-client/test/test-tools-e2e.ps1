#!/usr/bin/env pwsh
<#
.SYNOPSIS
    End-to-end test script for the ElevenLabs tools integration.

.DESCRIPTION
    This script simulates ElevenLabs webhook calls to test the server tools flow.
    Run this after starting the platform-client server.

.EXAMPLE
    # First start the server:
    cd packages/clients/platform-client
    pnpm dev
    
    # Then run this test script:
    .\test\test-tools-e2e.ps1
#>

$BaseUrl = "http://localhost:3000"
$TenantId = "platform-client"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "ElevenLabs Tools Integration E2E Test" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Helper function to make API calls
function Test-Endpoint {
    param(
        [string]$Method,
        [string]$Endpoint,
        [hashtable]$Body = @{},
        [string]$Description
    )
    
    Write-Host "TEST: $Description" -ForegroundColor Yellow
    Write-Host "  $Method $Endpoint" -ForegroundColor Gray
    
    try {
        $headers = @{
            "Content-Type" = "application/json"
            "X-Tenant-ID" = $TenantId
            "X-User-Role" = "client_user"
        }
        
        if ($Method -eq "GET") {
            $response = Invoke-RestMethod -Uri "$BaseUrl$Endpoint" -Method $Method -Headers $headers
        } else {
            $jsonBody = $Body | ConvertTo-Json -Depth 10
            $response = Invoke-RestMethod -Uri "$BaseUrl$Endpoint" -Method $Method -Headers $headers -Body $jsonBody
        }
        
        Write-Host "  ✅ PASS" -ForegroundColor Green
        Write-Host "  Response: $($response | ConvertTo-Json -Depth 3 -Compress)" -ForegroundColor DarkGray
        return $true
    }
    catch {
        Write-Host "  ❌ FAIL: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
    Write-Host ""
}

$passed = 0
$failed = 0

Write-Host ""
Write-Host "--- Health Checks ---" -ForegroundColor Magenta
Write-Host ""

# Test 1: Server health
if (Test-Endpoint -Method "GET" -Endpoint "/health" -Description "Server health check") { $passed++ } else { $failed++ }

# Test 2: Tools health
if (Test-Endpoint -Method "GET" -Endpoint "/api/tools/health" -Description "Tools endpoint health") { $passed++ } else { $failed++ }

Write-Host ""
Write-Host "--- Tool Discovery ---" -ForegroundColor Magenta
Write-Host ""

# Test 3: List all tools
if (Test-Endpoint -Method "GET" -Endpoint "/api/tools" -Description "List all registered tools") { $passed++ } else { $failed++ }

# Test 4: Get client tools
if (Test-Endpoint -Method "GET" -Endpoint "/api/tools/client" -Description "Get client-side tools") { $passed++ } else { $failed++ }

# Test 5: Get ElevenLabs config
if (Test-Endpoint -Method "GET" -Endpoint "/api/tools/config/elevenlabs" -Description "Generate ElevenLabs tool config") { $passed++ } else { $failed++ }

Write-Host ""
Write-Host "--- Server Tool Execution (Simulated ElevenLabs Webhooks) ---" -ForegroundColor Magenta
Write-Host ""

# Test 6: Search products tool
$searchParams = @{
    conversation_id = "test-conv-123"
    user_id = "test-user-456"
    query = "shoes"
    metadata = @{ test = $true }
}
if (Test-Endpoint -Method "POST" -Endpoint "/api/tools/ecommerce/search_products" -Body $searchParams -Description "Execute search_products tool") { $passed++ } else { $failed++ }

# Test 7: Add to cart tool (expects product not found - graceful handling)
$cartParams = @{
    conversation_id = "test-conv-123"
    user_id = "test-user-456"
    product_id = "prod-001"
    quantity = 2
}
# Note: This may return 400 if product doesn't exist - that's expected behavior
Write-Host "TEST: Execute add_to_cart tool (may fail if product not in catalog)" -ForegroundColor Yellow
Write-Host "  POST /api/tools/ecommerce/add_to_cart" -ForegroundColor Gray
try {
    $headers = @{
        "Content-Type" = "application/json"
        "X-Tenant-ID" = $TenantId
        "X-User-Role" = "client_user"
    }
    $jsonBody = $cartParams | ConvertTo-Json -Depth 10
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/tools/ecommerce/add_to_cart" -Method POST -Headers $headers -Body $jsonBody
    Write-Host "  ✅ PASS" -ForegroundColor Green
    Write-Host "  Response: $($response | ConvertTo-Json -Depth 3 -Compress)" -ForegroundColor DarkGray
    $passed++
} catch {
    # 400 is expected if product not found - count as pass for validation test
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "  ✅ PASS (correctly rejected invalid product)" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  ❌ FAIL: $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}

# Test 8: Get cart tool
$getCartParams = @{
    conversation_id = "test-conv-123"
    user_id = "test-user-456"
}
if (Test-Endpoint -Method "POST" -Endpoint "/api/tools/ecommerce/get_cart" -Body $getCartParams -Description "Execute get_cart tool") { $passed++ } else { $failed++ }

Write-Host ""
Write-Host "--- Voice Configuration ---" -ForegroundColor Magenta
Write-Host ""

# Test 9: Voice signed URL
if (Test-Endpoint -Method "GET" -Endpoint "/api/voice/signed-url" -Description "Get voice signed URL") { $passed++ } else { $failed++ }

# Test 10: Voice config
if (Test-Endpoint -Method "GET" -Endpoint "/api/voice/config" -Description "Get voice config") { $passed++ } else { $failed++ }

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "TEST RESULTS" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($failed -eq 0) {
    Write-Host "🎉 All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠️ Some tests failed. Check the output above." -ForegroundColor Yellow
    exit 1
}
