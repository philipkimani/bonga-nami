-- WhatsApp Extension - Database Schema
-- Production-safe, minimal schema for WhatsApp integration

-- ============================================================
-- A) WhatsApp numbers → tenant mapping
-- ============================================================
-- Maps WhatsApp Business phone number IDs to tenants
-- One WhatsApp number per tenant for fast lookup
CREATE TABLE whatsapp_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  phone_number_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  
  -- Foreign key to tenants table (adjust to your schema)
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) 
    REFERENCES tenants(id) ON DELETE CASCADE
);

-- Index for fast tenant lookup by phone number
CREATE INDEX idx_whatsapp_numbers_phone 
  ON whatsapp_numbers(phone_number_id);

-- Index for querying active numbers per tenant
CREATE INDEX idx_whatsapp_numbers_tenant 
  ON whatsapp_numbers(tenant_id) WHERE is_active = true;


-- ============================================================
-- B) Minimal conversation log (optional but recommended)
-- ============================================================
-- Tracks ongoing conversations for context and support
-- Upsert on (tenant_id, user_phone) to update last message
CREATE TABLE whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_phone TEXT NOT NULL,
  last_message TEXT,
  updated_at TIMESTAMP DEFAULT now(),
  
  -- Unique constraint for upsert operations
  CONSTRAINT unique_tenant_user UNIQUE (tenant_id, user_phone)
);

-- Index for finding user conversations
CREATE INDEX idx_whatsapp_conversations_user 
  ON whatsapp_conversations(tenant_id, user_phone);


-- ============================================================
-- C) Usage metering (future billing-ready)
-- ============================================================
-- Tracks inbound/outbound messages for billing and limits
-- Simple increment on each send/receive
CREATE TABLE whatsapp_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  created_at TIMESTAMP DEFAULT now()
);

-- Index for billing queries (count messages per tenant per period)
CREATE INDEX idx_whatsapp_usage_tenant_date 
  ON whatsapp_usage(tenant_id, created_at);

-- Index for direction-specific queries
CREATE INDEX idx_whatsapp_usage_direction 
  ON whatsapp_usage(tenant_id, direction, created_at);


-- ============================================================
-- Example Queries
-- ============================================================

-- Get tenant by phone number ID (used in webhook handler)
-- SELECT tenant_id, access_token, is_active
-- FROM whatsapp_numbers 
-- WHERE phone_number_id = $1 AND is_active = true;

-- Get tenant with capabilities (for capability gate)
-- SELECT t.id, t.capabilities 
-- FROM whatsapp_numbers w 
-- JOIN tenants t ON w.tenant_id = t.id 
-- WHERE w.phone_number_id = $1 AND w.is_active = true;

-- Upsert conversation log
-- INSERT INTO whatsapp_conversations (tenant_id, user_phone, last_message, updated_at)
-- VALUES ($1, $2, $3, now())
-- ON CONFLICT (tenant_id, user_phone) 
-- DO UPDATE SET last_message = EXCLUDED.last_message, updated_at = now();

-- Track inbound message
-- INSERT INTO whatsapp_usage (tenant_id, direction) 
-- VALUES ($1, 'inbound');

-- Track outbound message
-- INSERT INTO whatsapp_usage (tenant_id, direction) 
-- VALUES ($1, 'outbound');

-- Get monthly usage for billing
-- SELECT 
--   direction,
--   COUNT(*) as message_count
-- FROM whatsapp_usage
-- WHERE tenant_id = $1
--   AND created_at >= date_trunc('month', now())
-- GROUP BY direction;
