/**
 * Database Utility
 * 
 * Centralized Prisma client management for the platform.
 * Handles connection, retry logic, and graceful fallback.
 * 
 * SCALABILITY:
 * - Works for any new client deployment automatically
 * - Gracefully handles missing DATABASE_URL
 * - Retries connection on transient failures
 * - Single Prisma instance across all routes
 * 
 * NEON SERVERLESS FIX:
 * - Uses connection pooling URL if available
 * - Recreates client on connection errors (not just reconnect)
 * - Proper handling of idle connection timeouts
 * 
 * @module services/database
 */

import { PrismaClient } from "@prisma/client";

// ============================================================================
// STATE
// ============================================================================

let prisma: PrismaClient | null = null;
let connectionStatus: 'not_initialized' | 'connecting' | 'connected' | 'failed' = 'not_initialized';
let connectionError: string | null = null;
let connectionPromise: Promise<PrismaClient | null> | null = null;
let lastConnectionAttempt: number = 0;
let consecutiveFailures: number = 0;

// Health probe cache: avoids running SELECT 1 on every request.
// Only re-probe if more than HEALTH_PROBE_INTERVAL_MS has elapsed since last success.
let lastSuccessfulProbe: number = 0;
const HEALTH_PROBE_INTERVAL_MS = 30_000; // 30 seconds

// Reconnection settings for serverless Postgres (Neon)
const RECONNECT_DELAY_MS = 1000; // Reduced from 5s - Neon reconnects fast
const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_CONSECUTIVE_FAILURES = 5; // After this, wait longer between retries
const BACKOFF_DELAY_MS = 30000; // 30s backoff after too many failures

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the Prisma client instance.
 * Returns null if database is not available.
 * Handles reconnection for serverless Postgres (Neon) that closes idle connections.
 * 
 * @returns PrismaClient or null if DB unavailable
 */
export async function getDatabase(): Promise<PrismaClient | null> {
  // No DATABASE_URL = no database
  if (!process.env.DATABASE_URL) {
    return null;
  }
  
  // Already connected - verify connection is still alive (with caching)
  if (connectionStatus === 'connected' && prisma) {
    const now = Date.now();
    // If the last successful probe was recent, skip the SELECT 1 check
    // to avoid adding latency to every request (especially on Neon serverless).
    if (now - lastSuccessfulProbe < HEALTH_PROBE_INTERVAL_MS) {
      return prisma;
    }
    try {
      // Periodic connection check - if it fails, reconnect
      await prisma.$queryRaw`SELECT 1`;
      lastSuccessfulProbe = now;
      return prisma;
    } catch (error) {
      // Connection dropped (common with Neon serverless), trigger reconnect
      console.log('[database] Connection dropped, reconnecting...');
      connectionStatus = 'not_initialized';
      lastSuccessfulProbe = 0;
      prisma = null;
    }
  }
  
  // Failed but enough time has passed - allow retry
  if (connectionStatus === 'failed') {
    const now = Date.now();
    if (now - lastConnectionAttempt > RECONNECT_DELAY_MS) {
      console.log('[database] Retrying connection after previous failure...');
      connectionStatus = 'not_initialized';
    } else {
      return null;
    }
  }
  
  // Connection in progress - wait for it
  if (connectionStatus === 'connecting' && connectionPromise) {
    return connectionPromise;
  }
  
  // Start new connection attempt
  connectionStatus = 'connecting';
  lastConnectionAttempt = Date.now();
  connectionPromise = initializeDatabase();
  
  return connectionPromise;
}

/**
 * Check if database is available
 */
export function isDatabaseAvailable(): boolean {
  return connectionStatus === 'connected' && prisma !== null;
}

/**
 * Get database connection status for health checks
 */
export function getDatabaseStatus(): { 
  available: boolean; 
  status: string; 
  error: string | null;
} {
  return {
    available: isDatabaseAvailable(),
    status: connectionStatus,
    error: connectionError,
  };
}

/**
 * Disconnect from database (for graceful shutdown)
 */
export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    connectionStatus = 'not_initialized';
  }
}

// ============================================================================
// PRIVATE
// ============================================================================

async function initializeDatabase(): Promise<PrismaClient | null> {
  try {
    console.log('[database] Connecting to database...');
    
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'error', 'warn'] 
        : ['error'],
      // Datasource configuration for serverless Postgres (Neon)
      datasourceUrl: process.env.DATABASE_URL,
    });
    
    // Test the connection with retry logic
    let attempts = 0;
    while (attempts < MAX_RECONNECT_ATTEMPTS) {
      try {
        await prisma.$connect();
        break;
      } catch (connectError) {
        attempts++;
        if (attempts >= MAX_RECONNECT_ATTEMPTS) {
          throw connectError;
        }
        console.log(`[database] Connection attempt ${attempts} failed, retrying in ${RECONNECT_DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));
      }
    }
    
    connectionStatus = 'connected';
    connectionError = null;
    lastSuccessfulProbe = Date.now(); // Mark initial connection as a successful probe
    console.log('[database] ✅ Connected to database');
    
    return prisma;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    // Check for common recoverable errors
    if (message.includes('did not initialize yet')) {
      console.error('[database] ❌ Prisma client not generated. Run: npx prisma generate');
    } else if (message.includes('Can\'t reach database')) {
      console.error('[database] ❌ Cannot reach database. Check DATABASE_URL.');
    } else if (message.includes('kind: Closed')) {
      console.error('[database] ❌ Database connection closed (Neon idle timeout). Will retry on next request.');
    } else {
      console.error('[database] ❌ Database connection failed:', message);
    }
    
    connectionStatus = 'failed';
    connectionError = message;
    prisma = null;
    
    return null;
  }
}

// ============================================================================
// AUTO-INIT ON IMPORT
// ============================================================================

// Start connection immediately if DATABASE_URL is set
if (process.env.DATABASE_URL) {
  getDatabase().catch(() => {
    // Error already logged in initializeDatabase
  });
}
