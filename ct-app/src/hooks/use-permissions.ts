export enum Entities { ORDERS = "ORDERS", CLIENTS = "CLIENTS", CARRIERS = "COUNTERPARTIES", USERS = "USERS", PORTS = "PORTS", DRIVERS = "DRIVERS", TRUCKS = "TRUCKS", TRAILERS = "TRAILERS" }

export function usePermissions() {
  const permissions: string[] = [];
  const role = "LOGISTICS_MANAGER";
  const isAdmin = false;
  const isLoading = false;

  const has = (entity: string, field: string) => {
    if (isAdmin) return true;
    return permissions.some((p: string) => p === `${entity}:${field}` || p === `${entity}:all`);
  };

  return {
    isLoading,
    isAdmin,
    role,
    permissions,
    canView: (entity: string) => has(entity, "canView"),
    canEdit: (entity: string) => has(entity, "canEdit"),
    canDelete: (entity: string) => has(entity, "canDelete"),
    canCreate: (entity: string) => has(entity, "canCreate"),
    has,
  };
}

