/**
 * WhatsApp Extension - Tenant Resolver
 * 
 * Maps WhatsApp phone number IDs to tenant/client IDs.
 * This allows multi-tenant support where different WhatsApp numbers
 * are associated with different clients.
 */

import type { TenantMapping, Tenant } from './types.js';

// In-memory store for development (replace with database in production)
const tenantMappings = new Map<string, TenantMapping>();

// In-memory tenant store for development (replace with database in production)
const tenants = new Map<string, Tenant>();

/**
 * Resolve tenant from WhatsApp phone number ID
 * 
 * @param phoneNumberId - WhatsApp Business Account phone number ID
 * @returns Tenant object with capabilities or null if not found
 */
export async function resolveTenantByPhoneNumberId(
  phoneNumberId: string
): Promise<Tenant | null> {
  // Check in-memory cache first (development only)
  const mapping = tenantMappings.get(phoneNumberId);
  if (mapping) {
    const tenant = tenants.get(mapping.tenantId);
    if (tenant) {
      return tenant;
    }
  }

  // ============================================================
  // PRODUCTION DATABASE LOOKUP
  // ============================================================
  // Replace the in-memory lookup above with this query:
  //
  // const result = await db.query(`
  //   SELECT 
  //     t.id as tenant_id,
  //     t.capabilities,
  //     w.access_token,
  //     w.is_active
  //   FROM whatsapp_numbers w 
  //   JOIN tenants t ON w.tenant_id = t.id 
  //   WHERE w.phone_number_id = $1 AND w.is_active = true
  // `, [phoneNumberId]);
  //
  // if (result.rows.length === 0) {
  //   return null;
  // }
  //
  // const row = result.rows[0];
  // const tenant: Tenant = {
  //   tenantId: row.tenant_id,
  //   capabilities: row.capabilities || [],
  // };
  //
  // // Cache the access token for this phone number
  // tenantMappings.set(phoneNumberId, {
  //   tenantId: row.tenant_id,
  //   phoneNumberId,
  //   accessToken: row.access_token,
  // });
  //
  // return tenant;
  // ============================================================
  
  // Fallback to environment variable for single-tenant setups
  const fallbackTenantId = process.env.TENANT_ID || null;
  
  if (fallbackTenantId) {
    // Create default tenant with WhatsApp capability enabled
    const tenant: Tenant = {
      tenantId: fallbackTenantId,
      capabilities: ['whatsapp'], // Default to WhatsApp enabled for development
    };
    
    // Cache it
    tenants.set(fallbackTenantId, tenant);
    registerTenantMapping({
      tenantId: fallbackTenantId,
      phoneNumberId,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    });
    
    return tenant;
  }
  
  return null;
}

/**
 * Get access token for a phone number ID
 * 
 * @param phoneNumberId - WhatsApp Business Account phone number ID
 * @returns Access token or null if not found
 */
export async function getAccessTokenForPhoneNumber(
  phoneNumberId: string
): Promise<string | null> {
  const mapping = tenantMappings.get(phoneNumberId);
  return mapping?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || null;
}

/**
 * Register a tenant mapping (for setup/configuration)
 * 
 * @param mapping - Tenant mapping to register
 */
export function registerTenantMapping(mapping: TenantMapping): void {
  tenantMappings.set(mapping.phoneNumberId, mapping);
}

/**
 * Get all tenant mappings (for admin/debugging)
 */
export function getAllTenantMappings(): TenantMapping[] {
  return Array.from(tenantMappings.values());
}
