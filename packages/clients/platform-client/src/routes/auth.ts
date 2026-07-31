/**
 * Authentication Routes
 * 
 * Simple JWT-based admin authentication for the platform.
 * Admin credentials are stored in database (PlatformConfig).
 * 
 * SECURITY:
 * - Passwords hashed with bcrypt (12 rounds)
 * - JWT tokens with 24h expiry
 * - HttpOnly cookies for web UI
 * - Bearer token header for API access
 */

import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDatabase, isDatabaseAvailable } from "../services/database.js";

export const authRouter = express.Router();

// ============================================================================
// CONFIGURATION
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = "24h";
const BCRYPT_ROUNDS = 12;
const COOKIE_NAME = "admin_token";

// Ensure JWT_SECRET is set in production
if (process.env.NODE_ENV === "production" && !JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required in production");
}

// Use a fallback only in development
const SECRET = JWT_SECRET || "dev-only-secret-change-in-production";

// ============================================================================
// TYPES
// ============================================================================

interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
  role: "super_admin" | "admin" | "viewer";
  mustChangePassword: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

interface JwtPayload {
  userId: string;
  username: string;
  role: string;
  tenantId: string;
}

// ============================================================================
// DATABASE CONNECTION (uses shared utility)
// ============================================================================

let dbInitialized = false;

// Default admin credentials (CHANGE IN PRODUCTION!)
const DEFAULT_ADMIN = {
  username: "admin",
  // Default password: "admin123" - MUST be changed on first login
  passwordHash: "$2b$12$gaNCVHNC8LITszpJhgaU9u13yMUPhK2YMN0iyYDVgzLOBkJXptTNS",
};

/**
 * Ensure default admin exists in database on startup
 */
async function ensureDefaultAdmin(): Promise<void> {
  if (dbInitialized) return;
  
  try {
    const db = await getDatabase();
    if (!db) {
      console.log("[auth] Database not available - skipping admin initialization");
      return;
    }
    
    const tenantId = process.env.TENANT_ID || "default";
    
    // Check if any admin exists
    const existingAdmin = await db.adminUser.findFirst({
      where: { tenantId },
    });
    
    if (!existingAdmin) {
      // Create default admin
      await db.adminUser.create({
        data: {
          tenantId,
          username: DEFAULT_ADMIN.username,
          passwordHash: DEFAULT_ADMIN.passwordHash,
          displayName: "Administrator",
          role: "SUPER_ADMIN",
          isActive: true,
          mustChangePassword: true, // Force password change on first login
        },
      });
      console.log("[auth] Created default admin user (username: admin, password: admin123)");
      console.log("[auth] ⚠️  CHANGE THIS PASSWORD IMMEDIATELY!");
    }
    
    dbInitialized = true;
  } catch (error) {
    console.error("[auth] Failed to initialize database:", error);
    // Will fall back to in-memory for this request
  }
}

// Initialize on module load
ensureDefaultAdmin().catch(console.error);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateToken(user: AdminUser, tenantId: string): string {
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    tenantId,
  };
  return jwt.sign(payload, SECRET, { expiresIn: JWT_EXPIRY });
}

function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

async function findUserByUsername(username: string): Promise<AdminUser | null> {
  const tenantId = process.env.TENANT_ID || "default";
  // Normalize username to lowercase for case-insensitive comparison
  const normalizedUsername = username.toLowerCase().trim();
  
  try {
    const db = await getDatabase();
    if (!db) {
      // SECURITY: In production, never fall back to hardcoded credentials.
      // If the database is unavailable, authentication must fail entirely.
      if (process.env.NODE_ENV === "production") {
        console.error("[auth] Database unavailable in production — refusing fallback to default credentials");
        return null;
      }
      // Development only: fall back to hardcoded default admin for local dev convenience
      console.warn("[auth] WARNING: Using hardcoded default admin credentials (development mode only)");
      if (normalizedUsername === DEFAULT_ADMIN.username.toLowerCase()) {
        return {
          id: "fallback-admin",
          username: DEFAULT_ADMIN.username,
          passwordHash: DEFAULT_ADMIN.passwordHash,
          role: "super_admin",
          mustChangePassword: true, // Always force change for fallback
          createdAt: new Date(),
        };
      }
      return null;
    }
    
    // Try exact match first (more efficient)
    let dbUser = await db.adminUser.findUnique({
      where: { tenantId_username: { tenantId, username: normalizedUsername } },
    });
    
    // If not found, try case-insensitive search
    if (!dbUser) {
      dbUser = await db.adminUser.findFirst({
        where: { 
          tenantId,
          username: { equals: normalizedUsername, mode: 'insensitive' }
        },
      });
    }
    
    if (dbUser && dbUser.isActive) {
      return {
        id: dbUser.id,
        username: dbUser.username,
        passwordHash: dbUser.passwordHash,
        role: dbUser.role.toLowerCase() as "super_admin" | "admin" | "viewer",
        mustChangePassword: dbUser.mustChangePassword,
        createdAt: dbUser.createdAt,
        lastLoginAt: dbUser.lastLoginAt || undefined,
      };
    }
  } catch (error) {
    console.error("[auth] Database error during user lookup:", error);
    // SECURITY: In production, never fall back to hardcoded credentials on DB error.
    // Auth must fail if the database is unreachable.
    if (process.env.NODE_ENV === "production") {
      console.error("[auth] Database error in production — refusing fallback to default credentials");
      return null;
    }
    // Development only: fall back to hardcoded default admin for local dev convenience
    console.warn("[auth] WARNING: Using hardcoded default admin credentials after DB error (development mode only)");
    if (normalizedUsername === DEFAULT_ADMIN.username.toLowerCase()) {
      return {
        id: "fallback-admin",
        username: DEFAULT_ADMIN.username,
        passwordHash: DEFAULT_ADMIN.passwordHash,
        role: "super_admin",
        mustChangePassword: true, // Always force change for fallback
        createdAt: new Date(),
      };
    }
  }
  
  return null;
}

async function updateLastLogin(userId: string): Promise<void> {
  try {
    const db = await getDatabase();
    if (!db) return; // Skip if DB not available
    
    await db.adminUser.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        loginCount: { increment: 1 },
      },
    });
  } catch (error) {
    console.error("[auth] Failed to update last login:", error);
  }
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/auth/login
 * 
 * Authenticate admin user and return JWT token.
 */
authRouter.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "Username and password are required",
      });
    }
    
    // Find user
    const user = await findUserByUsername(username);
    if (!user) {
      console.log(`[auth] Login failed: user not found - ${username}`);
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      console.log(`[auth] Login failed: invalid password - ${username}`);
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }
    
    // Get tenant ID
    const tenantId = process.env.TENANT_ID || "default";
    
    // Generate token
    const token = generateToken(user, tenantId);
    
    // Update last login
    await updateLastLogin(user.id);
    
    console.log(`[auth] Login successful: ${username}`);
    
    // Set cookie for web UI
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    
    // Also return token for API usage
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      expiresIn: JWT_EXPIRY,
    });
  } catch (error) {
    console.error("[auth] Login error:", error);
    res.status(500).json({
      success: false,
      error: "Authentication failed",
    });
  }
});

/**
 * POST /api/auth/logout
 * 
 * Clear authentication cookie.
 */
authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true, message: "Logged out" });
});

/**
 * GET /api/auth/session
 * 
 * Check if current session is valid.
 */
authRouter.get("/session", (req, res) => {
  // Get token from cookie or header
  const cookieToken = req.cookies?.[COOKIE_NAME];
  const headerToken = req.headers.authorization?.replace("Bearer ", "");
  const token = cookieToken || headerToken;
  
  if (!token) {
    return res.json({
      authenticated: false,
    });
  }
  
  const payload = verifyToken(token);
  if (!payload) {
    res.clearCookie(COOKIE_NAME);
    return res.json({
      authenticated: false,
    });
  }
  
  res.json({
    authenticated: true,
    user: {
      id: payload.userId,
      username: payload.username,
      role: payload.role,
    },
    tenantId: payload.tenantId,
  });
});

/**
 * POST /api/auth/change-password
 * 
 * Change admin password.
 */
authRouter.post("/change-password", async (req, res) => {
  try {
    // Get token
    const cookieToken = req.cookies?.[COOKIE_NAME];
    const headerToken = req.headers.authorization?.replace("Bearer ", "");
    const token = cookieToken || headerToken;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Not authenticated",
      });
    }
    
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired token",
      });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Current password and new password are required",
      });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 8 characters",
      });
    }
    
    // Find user
    const user = await findUserByUsername(payload.username);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }
    
    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: "Current password is incorrect",
      });
    }
    
    // Hash new password
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    
    // Update in database
    try {
      const db = await getDatabase();
      if (!db) {
        return res.status(500).json({
          success: false,
          error: "Database not available",
        });
      }
      await db.adminUser.update({
        where: { id: user.id },
        data: { 
          passwordHash: newHash,
          mustChangePassword: false, // Clear the flag after password change
        },
      });
      console.log(`[auth] Password changed: ${user.username}`);
    } catch (dbError) {
      console.error("[auth] Failed to update password in database:", dbError);
      return res.status(500).json({
        success: false,
        error: "Failed to save new password",
      });
    }
    
    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("[auth] Change password error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to change password",
    });
  }
});

// ============================================================================
// MIDDLEWARE EXPORT
// ============================================================================

/**
 * Authentication middleware for protecting routes.
 * 
 * Usage:
 * ```ts
 * import { requireAuth } from "./routes/auth.js";
 * app.use("/api/admin", requireAuth, adminRouter);
 * ```
 */
export function requireAuth(req: any, res: any, next: any) {
  // Get token from cookie or header
  const cookieToken = req.cookies?.[COOKIE_NAME];
  const headerToken = req.headers.authorization?.replace("Bearer ", "");
  const token = cookieToken || headerToken;
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Authentication required",
      code: "AUTH_REQUIRED",
    });
  }
  
  const payload = verifyToken(token);
  if (!payload) {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({
      success: false,
      error: "Invalid or expired token",
      code: "INVALID_TOKEN",
    });
  }
  
  // Attach user info to request
  req.user = payload;
  next();
}

/**
 * Role-based authorization middleware.
 * 
 * Usage:
 * ```ts
 * app.delete("/api/admin/users/:id", requireAuth, requireRole("super_admin"), handler);
 * ```
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        code: "AUTH_REQUIRED",
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions",
        code: "FORBIDDEN",
      });
    }
    
    next();
  };
}

// ============================================================================
// USER MANAGEMENT ROUTES (SUPER_ADMIN only)
// ============================================================================

/**
 * GET /api/auth/users
 * 
 * List all admin users. Requires SUPER_ADMIN role.
 */
authRouter.get("/users", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const tenantId = process.env.TENANT_ID || "default";
    const db = await getDatabase();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: "Database not available",
      });
    }
    
    const users = await db.adminUser.findMany({
      where: { tenantId },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        loginCount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    
    res.json({
      success: true,
      users: users.map(u => ({
        ...u,
        role: u.role.toLowerCase(),
      })),
    });
  } catch (error) {
    console.error("[auth] List users error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to list users",
    });
  }
});

/**
 * POST /api/auth/users
 * 
 * Create a new admin user. Requires SUPER_ADMIN role.
 */
authRouter.post("/users", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const tenantId = process.env.TENANT_ID || "default";
    const { username, password, email, displayName, role } = req.body;
    
    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "Username and password are required",
      });
    }
    
    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        error: "Username must be at least 3 characters",
      });
    }
    
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 8 characters",
      });
    }
    
    // Validate role
    const validRoles = ["SUPER_ADMIN", "ADMIN", "VIEWER"];
    const normalizedRole = (role || "ADMIN").toUpperCase();
    if (!validRoles.includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        error: "Role must be one of: super_admin, admin, viewer",
      });
    }
    
    const db = await getDatabase();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: "Database not available",
      });
    }
    
    // Check if username exists
    const existing = await db.adminUser.findUnique({
      where: { tenantId_username: { tenantId, username } },
    });
    
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Username already exists",
      });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    
    // Create user
    const newUser = await db.adminUser.create({
      data: {
        tenantId,
        username,
        passwordHash,
        email: email || null,
        displayName: displayName || username,
        role: normalizedRole as any,
        isActive: true,
        mustChangePassword: true, // Force password change on first login
        createdById: (req as any).user?.userId,
      },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    
    console.log(`[auth] User created: ${username} (role: ${normalizedRole}) by ${(req as any).user?.username}`);
    
    res.status(201).json({
      success: true,
      user: {
        ...newUser,
        role: newUser.role.toLowerCase(),
      },
    });
  } catch (error) {
    console.error("[auth] Create user error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create user",
    });
  }
});

/**
 * PUT /api/auth/users/:id
 * 
 * Update an admin user. Requires SUPER_ADMIN role.
 */
authRouter.put("/users/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { email, displayName, role, isActive } = req.body;
    const currentUserId = (req as any).user?.userId;
    
    const db = await getDatabase();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: "Database not available",
      });
    }
    
    // Find user
    const user = await db.adminUser.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }
    
    // Prevent self-demotion from SUPER_ADMIN
    if (id === currentUserId && role && role.toUpperCase() !== "SUPER_ADMIN") {
      return res.status(400).json({
        success: false,
        error: "Cannot demote yourself from super_admin",
      });
    }
    
    // Validate role if provided
    if (role) {
      const validRoles = ["SUPER_ADMIN", "ADMIN", "VIEWER"];
      if (!validRoles.includes(role.toUpperCase())) {
        return res.status(400).json({
          success: false,
          error: "Role must be one of: super_admin, admin, viewer",
        });
      }
    }
    
    // Update user
    const updated = await db.adminUser.update({
      where: { id },
      data: {
        email: email !== undefined ? email : undefined,
        displayName: displayName !== undefined ? displayName : undefined,
        role: role ? role.toUpperCase() as any : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    
    console.log(`[auth] User updated: ${updated.username} by ${(req as any).user?.username}`);
    
    res.json({
      success: true,
      user: {
        ...updated,
        role: updated.role.toLowerCase(),
      },
    });
  } catch (error) {
    console.error("[auth] Update user error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update user",
    });
  }
});

/**
 * DELETE /api/auth/users/:id
 * 
 * Delete an admin user. Requires SUPER_ADMIN role.
 */
authRouter.delete("/users/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = (req as any).user?.userId;
    
    // Prevent self-deletion
    if (id === currentUserId) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete yourself",
      });
    }
    
    const db = await getDatabase();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: "Database not available",
      });
    }
    
    // Find user
    const user = await db.adminUser.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }
    
    // Delete user
    await db.adminUser.delete({ where: { id } });
    
    console.log(`[auth] User deleted: ${user.username} by ${(req as any).user?.username}`);
    
    res.json({
      success: true,
      message: `User ${user.username} deleted`,
    });
  } catch (error) {
    console.error("[auth] Delete user error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete user",
    });
  }
});

/**
 * POST /api/auth/users/:id/reset-password
 * 
 * Reset a user's password. Requires SUPER_ADMIN role.
 */
authRouter.post("/users/:id/reset-password", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 8 characters",
      });
    }
    
    const db = await getDatabase();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: "Database not available",
      });
    }
    
    // Find user
    const user = await db.adminUser.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }
    
    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    
    // Update password and force change on next login
    await db.adminUser.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
    });
    
    console.log(`[auth] Password reset for: ${user.username} by ${(req as any).user?.username}`);
    
    res.json({
      success: true,
      message: `Password reset for ${user.username}. They will be required to change it on next login.`,
    });
  } catch (error) {
    console.error("[auth] Reset password error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reset password",
    });
  }
});

console.log("[auth] Authentication routes loaded");
