# WhatsApp Extension - Endpoint Testing Script
# Run this after starting the test server

Write-Host "🧪 Testing WhatsApp Extension Endpoints" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:3000"

# Test 1: Health Check
Write-Host "1️⃣  Testing Health Endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
    Write-Host "✅ Health Check:" -ForegroundColor Green
    $health | ConvertTo-Json -Depth 3
} catch {
    Write-Host "❌ Health Check Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Root Endpoint
Write-Host "2️⃣  Testing Root Endpoint (/)..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/" -Method Get
    Write-Host "✅ Root Endpoint Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "   Content-Type: $($response.Headers['Content-Type'])"
} catch {
    Write-Host "❌ Root Endpoint Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Webhook Verification
Write-Host "3️⃣  Testing Webhook Verification..." -ForegroundColor Yellow
$verifyToken = "your_webhook_verify_token_here"  # From .env file
$challenge = "TEST_CHALLENGE_12345"
try {
    $params = @{
        'hub.mode' = 'subscribe'
        'hub.verify_token' = $verifyToken
        'hub.challenge' = $challenge
    }
    $query = ($params.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join '&'
    $response = Invoke-RestMethod -Uri "$baseUrl/webhooks/whatsapp?$query" -Method Get
    Write-Host "✅ Webhook Verification:" -ForegroundColor Green
    Write-Host "   Challenge Response: $response"
} catch {
    Write-Host "❌ Webhook Verification Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Simulate Incoming WhatsApp Message
Write-Host "4️⃣  Testing Incoming Message Handler..." -ForegroundColor Yellow
try {
    $messagePayload = @{
        entry = @(
            @{
                changes = @(
                    @{
                        value = @{
                            metadata = @{
                                phone_number_id = "your_phone_number_id_here"
                            }
                            messages = @(
                                @{
                                    from = "1234567890"
                                    type = "text"
                                    text = @{
                                        body = "Hello, test message!"
                                    }
                                    id = "test_msg_123"
                                    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
                                }
                            )
                        }
                    }
                )
            }
        )
    } | ConvertTo-Json -Depth 10

    $response = Invoke-RestMethod -Uri "$baseUrl/webhooks/whatsapp" -Method Post -Body $messagePayload -ContentType "application/json"
    Write-Host "✅ Message Handler Status: $($response.StatusCode)" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 200) {
        Write-Host "✅ Message Handler: Webhook acknowledged (200 OK)" -ForegroundColor Green
    } else {
        Write-Host "❌ Message Handler Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}
Write-Host ""

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "✅ Endpoint testing complete!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Tips:" -ForegroundColor Yellow
Write-Host "   - Server should be running on $baseUrl"
Write-Host "   - Update .env file with real credentials for full testing"
Write-Host "   - Use ngrok for Meta webhook integration"
Write-Host ""
