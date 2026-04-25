import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { db, withRetry } from "@/lib/db";
import { logger } from "@/lib/logger";

const JWT_SECRET = process.env.NEXTAUTH_SECRET || "container-transport-secret-key-2024-production";

export interface ServerUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  customRoleName?: string | null;
  branchId?: string | null;
  sessionId?: string;
  image?: string | null;
  canCreatePreliminary?: boolean;
}

/**
 * Get the current authenticated user from the request.
 * Works with our custom JWT authentication (ct-session-token cookie).
 */
export async function getServerUser(request: NextRequest): Promise<ServerUser | null> {
  try {
    // Get token from cookie
    const cookie = request.headers.get("cookie") || "";
    const match = cookie.match(/ct-session-token=([^;]+)/);
    
    if (!match) {
      logger.log("[ServerAuth] No ct-session-token cookie found");
      return null;
    }
    
    const token = match[1];
    
    // Verify token
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    
    if (!payload.id || !payload.role) {
      logger.log("[ServerAuth] Invalid token payload");
      return null;
    }
    
    // Get fresh user data from database
    const user = await withRetry(() => db.user.findUnique({
      where: { id: payload.id as string },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        customRoleName: true,
        branchId: true,
        dismissalDate: true,
        image: true,
        canCreatePreliminary: true,
      },
    }));
    
    if (!user) {
      logger.log("[ServerAuth] User not found in database:", payload.id);
      return null;
    }
    
    // Заблокировать доступ уволенным сотрудникам
    if (user.dismissalDate) {
      logger.log("[ServerAuth] Dismissed user attempted access:", user.id);
      return null;
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { dismissalDate, ...userData } = user;
    return {
      ...userData,
      sessionId: payload.sessionId as string | undefined,
    };
  } catch (error) {
    console.error("[ServerAuth] Error:", error);
    return null;
  }
}

/**
 * Require authentication - returns user or throws 401 response
 */
export async function requireAuth(request: NextRequest): Promise<ServerUser> {
  const user = await getServerUser(request);
  if (!user) {
    throw new Response(JSON.stringify({ error: "Не авторизован" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

/**
 * Require admin role - returns user or throws 401/403 response
 */
export async function requireAdmin(request: NextRequest): Promise<ServerUser> {
  const user = await requireAuth(request);
  if (user.role !== "ADMIN") {
    throw new Response(JSON.stringify({ error: "Доступ запрещен" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

// Права по умолчанию для ролей
const roleDefaultPermissions: Record<string, Record<string, { canView: boolean; canEdit: boolean; canCreate: boolean; canDelete: boolean }>> = {
  ADMIN: {
    ORDERS: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    CLIENTS: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    CARRIERS: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    COUNTERPARTIES: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    DRIVERS: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    TRUCKS: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    TRAILERS: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    CLIENT_CONTRACTS: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    CARRIER_CONTRACTS: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    PORTS: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    CONTAINER_TYPES: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    USERS: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    PAID_ORDERS: { canView: true, canEdit: true, canCreate: false, canDelete: false },
  },
  LOGISTICS_MANAGER: {
    ORDERS: { canView: true, canEdit: true, canCreate: true, canDelete: false },
    CLIENTS: { canView: true, canEdit: true, canCreate: true, canDelete: false },
    CARRIERS: { canView: true, canEdit: true, canCreate: true, canDelete: false },
    COUNTERPARTIES: { canView: true, canEdit: true, canCreate: true, canDelete: false },
    DRIVERS: { canView: true, canEdit: true, canCreate: true, canDelete: false },
    TRUCKS: { canView: true, canEdit: true, canCreate: true, canDelete: false },
    TRAILERS: { canView: true, canEdit: true, canCreate: true, canDelete: false },
    CLIENT_CONTRACTS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    CARRIER_CONTRACTS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    PORTS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    CONTAINER_TYPES: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    USERS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    PAID_ORDERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
  },
  COMMERCIAL_MANAGER: {
    ORDERS: { canView: true, canEdit: true, canCreate: true, canDelete: false },
    CLIENTS: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    CARRIERS: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    COUNTERPARTIES: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    DRIVERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    TRUCKS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    TRAILERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    CLIENT_CONTRACTS: { canView: true, canEdit: true, canCreate: true, canDelete: true },
    CARRIER_CONTRACTS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    PORTS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    CONTAINER_TYPES: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    USERS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    PAID_ORDERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
  },
  ACCOUNTANT: {
    ORDERS: { canView: true, canEdit: true, canCreate: false, canDelete: false },
    CLIENTS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    CARRIERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    COUNTERPARTIES: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    DRIVERS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    TRUCKS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    TRAILERS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    CLIENT_CONTRACTS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    CARRIER_CONTRACTS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    PORTS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    CONTAINER_TYPES: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    USERS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    PAID_ORDERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
  },
  LAWYER: {
    ORDERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    CLIENTS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    CARRIERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    COUNTERPARTIES: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    DRIVERS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    TRUCKS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    TRAILERS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    CLIENT_CONTRACTS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    CARRIER_CONTRACTS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    PORTS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    CONTAINER_TYPES: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    USERS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    PAID_ORDERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
  },
  EXPEDITOR: {
    ORDERS: { canView: true, canEdit: true, canCreate: false, canDelete: false },
    CLIENTS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    CARRIERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    COUNTERPARTIES: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    DRIVERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    TRUCKS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    TRAILERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    CLIENT_CONTRACTS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    CARRIER_CONTRACTS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    PORTS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    CONTAINER_TYPES: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    USERS: { canView: false, canEdit: false, canCreate: false, canDelete: false },
    PAID_ORDERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
  },
  CLIENT: {
    ORDERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
    PAID_ORDERS: { canView: true, canEdit: false, canCreate: false, canDelete: false },
  },
};

export type PermissionAction = "canView" | "canEdit" | "canCreate" | "canDelete";
export type PermissionEntity = "ORDERS" | "CLIENTS" | "CARRIERS" | "COUNTERPARTIES" | "DRIVERS" | "TRUCKS" | "TRAILERS" | "CLIENT_CONTRACTS" | "CARRIER_CONTRACTS" | "PORTS" | "CONTAINER_TYPES" | "USERS" | "PAID_ORDERS";

/**
 * Check if user has permission for a specific action on an entity
 */
export async function hasPermission(
  user: ServerUser,
  entity: PermissionEntity,
  action: PermissionAction
): Promise<boolean> {
  // Admin has all permissions
  if (user.role === "ADMIN") {
    return true;
  }

  // If user has a custom role, fetch its permissions
  if (user.customRoleName) {
    try {
      const customRole = await db.customRole.findUnique({
        where: { name: user.customRoleName },
      });
      if (customRole && customRole.isActive && customRole.permissions) {
        const perms = customRole.permissions as Record<string, Record<string, boolean>>;
        const entityPerms = perms[entity];
        if (entityPerms && typeof entityPerms[action] === 'boolean') {
          logger.log(`[hasPermission] Custom role "${user.customRoleName}" → ${entity}.${action} = ${entityPerms[action]}`);
          return entityPerms[action] as boolean;
        }
      }
    } catch (error) {
      logger.log("[hasPermission] Could not fetch custom role, using defaults");
    }
  }

  // Get role defaults
  const roleDefaults = roleDefaultPermissions[user.role];
  if (!roleDefaults) {
    logger.log(`[hasPermission] Unknown role "${user.role}" — no defaults. Denying ${entity}.${action}`);
    return false;
  }

  const defaultPerm = roleDefaults[entity];
  if (!defaultPerm) {
    logger.log(`[hasPermission] No defaults for entity "${entity}" in role "${user.role}". Denying ${action}`);
    return false;
  }

  // Try to get user's custom permissions from database
  try {
    const userPerm = await db.permission.findUnique({
      where: {
        userId_entity_field: {
          userId: user.id,
          entity,
          field: "all",
        },
      },
    });

    if (userPerm) {
      const dbValue = userPerm[action];
      const roleDefault = defaultPerm[action];
      // Если значение в БД отличается от дефолтного для роли — используем значение из БД
      // (явное переопределение: false там где default true, или true там где default false)
      // Если совпадает с дефолтом — используем дефолт (это может быть просто неустановленное поле)
      if (dbValue !== roleDefault) {
        logger.log(`[hasPermission] DB override for user=${user.id} entity=${entity} action=${action}: roleDefault=${roleDefault} -> dbValue=${dbValue}`);
        return dbValue;
      }
      // Значение совпадает с дефолтом — используем дефолт роли
      logger.log(`[hasPermission] DB value matches role default for user=${user.id} entity=${entity} action=${action}: ${roleDefault}`);
      return roleDefault;
    }
  } catch (error) {
    logger.log("[hasPermission] Could not fetch from DB, using defaults");
  }

  // Fall back to role defaults
  const result = defaultPerm[action];
  logger.log(`[hasPermission] User ${user.id} (${user.role}) → ${entity}.${action} = ${result} (role default)`);
  return result;
}

/**
 * Check if user can reassign orders to other managers.
 * ADMIN always can. Others need "canReassignManager" in custom role permissions.
 */
export async function canReassignManager(user: ServerUser): Promise<boolean> {
  if (user.role === "ADMIN") return true;

  // Check per-user permission marker record (entity="ORDERS", field="canReassignManager")
  try {
    const marker = await db.permission.findUnique({
      where: { userId_entity_field: { userId: user.id, entity: "ORDERS", field: "canReassignManager" } },
    });
    if (marker && marker.canView) {
      return true;
    }
  } catch {
    // fall through
  }

  // Check custom role permissions
  if (user.customRoleName) {
    try {
      const customRole = await db.customRole.findUnique({
        where: { name: user.customRoleName },
      });
      if (customRole && customRole.isActive && customRole.permissions) {
        const perms = customRole.permissions as Record<string, Record<string, boolean>>;
        const orderPerms = perms["ORDERS"];
        if (orderPerms && typeof orderPerms["canReassignManager"] === "boolean") {
          return orderPerms["canReassignManager"] as boolean;
        }
      }
    } catch {
      // fall through
    }
  }

  return false;
}

/**
 * Require permission - returns true or throws 403 response
 */
export async function requirePermission(
  user: ServerUser,
  entity: PermissionEntity,
  action: PermissionAction
): Promise<boolean> {
  const permitted = await hasPermission(user, entity, action);
  if (!permitted) {
    throw new Response(JSON.stringify({ error: "Доступ запрещен" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return true;
}

/**
 * Format color to lowercase
 */
export function formatColor(color: string | null | undefined): string {
  if (!color) return "не указан";
  return color.toLowerCase().trim();
}

/**
 * Format owner name - capitalize first letter of each word for names (ФИО),
 * preserve company names as-is if they contain common company prefixes
 */
export function formatOwnerName(name: string | null | undefined): string {
  if (!name) return "Не указан";
  
  const trimmed = name.trim();
  
  // Check if it's a company name (contains common prefixes)
  const companyPrefixes = ['ООО', 'ИП', 'ЗАО', 'ОАО', 'АО', 'ПАО', 'НКО', 'ФГУП', 'МУП', 'ГКУ', 'ООО"', '"ООО', '«ООО'];
  const isCompany = companyPrefixes.some(prefix => 
    trimmed.toUpperCase().startsWith(prefix.toUpperCase()) || 
    trimmed.toUpperCase().includes(' ' + prefix.toUpperCase())
  );
  
  if (isCompany) {
    // Keep company names mostly as-is but normalize case
    return trimmed;
  }
  
  // For ФИО - capitalize first letter of each word
  return trimmed.split(/\s+/)
    .map(word => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}
