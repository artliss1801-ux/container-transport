// Права доступа для различных ролей

export enum Role {
  ADMIN = "ADMIN",
  LOGISTICS_MANAGER = "LOGISTICS_MANAGER",
  COMMERCIAL_MANAGER = "COMMERCIAL_MANAGER",
  ACCOUNTANT = "ACCOUNTANT",
  LAWYER = "LAWYER",
}

export const roleLabels: Record<string, string> = {
  ADMIN: "Администратор",
  LOGISTICS_MANAGER: "Менеджер по логистике",
  COMMERCIAL_MANAGER: "Коммерческий менеджер",
  ACCOUNTANT: "Бухгалтер",
  LAWYER: "Юрист",
};

export const roleColors: Record<string, string> = {
  ADMIN: "bg-red-100 text-red-800 border-red-200",
  LOGISTICS_MANAGER: "bg-blue-100 text-blue-800 border-blue-200",
  COMMERCIAL_MANAGER: "bg-green-100 text-green-800 border-green-200",
  ACCOUNTANT: "bg-purple-100 text-purple-800 border-purple-200",
  LAWYER: "bg-amber-100 text-amber-800 border-amber-200",
};

// Права доступа
export interface Permissions {
  // Пользователи
  canManageUsers: boolean;
  canViewUsers: boolean;

  // Заявки
  canCreateOrders: boolean;
  canEditOrders: boolean;
  canDeleteOrders: boolean;
  canViewOrders: boolean;
  canAssignDriver: boolean;
  canChangeStatus: boolean;

  // Справочники
  canManageDirectories: boolean;

  // Отчёты
  canViewReports: boolean;
  canViewFinancialReports: boolean;
  canExportData: boolean;

  // Профиль
  canEditProfile: boolean;
  canEnable2FA: boolean;
}

export const permissions: Record<string, Permissions> = {
  ADMIN: {
    canManageUsers: true,
    canViewUsers: true,
    canCreateOrders: true,
    canEditOrders: true,
    canDeleteOrders: true,
    canViewOrders: true,
    canAssignDriver: true,
    canChangeStatus: true,
    canManageDirectories: true,
    canViewReports: true,
    canViewFinancialReports: true,
    canExportData: true,
    canEditProfile: true,
    canEnable2FA: true,
  },

  LOGISTICS_MANAGER: {
    canManageUsers: false,
    canViewUsers: false,
    canCreateOrders: true,
    canEditOrders: true,
    canDeleteOrders: false,
    canViewOrders: true,
    canAssignDriver: true,
    canChangeStatus: true,
    canManageDirectories: false,
    canViewReports: true,
    canViewFinancialReports: false,
    canExportData: true,
    canEditProfile: true,
    canEnable2FA: true,
  },

  COMMERCIAL_MANAGER: {
    canManageUsers: false,
    canViewUsers: false,
    canCreateOrders: true,
    canEditOrders: false,
    canDeleteOrders: false,
    canViewOrders: true,
    canAssignDriver: false,
    canChangeStatus: false,
    canManageDirectories: false,
    canViewReports: true,
    canViewFinancialReports: false,
    canExportData: true,
    canEditProfile: true,
    canEnable2FA: true,
  },

  ACCOUNTANT: {
    canManageUsers: false,
    canViewUsers: false,
    canCreateOrders: false,
    canEditOrders: false,
    canDeleteOrders: false,
    canViewOrders: true,
    canAssignDriver: false,
    canChangeStatus: false,
    canManageDirectories: false,
    canViewReports: true,
    canViewFinancialReports: true,
    canExportData: true,
    canEditProfile: true,
    canEnable2FA: true,
  },

  LAWYER: {
    canManageUsers: false,
    canViewUsers: false,
    canCreateOrders: false,
    canEditOrders: false,
    canDeleteOrders: false,
    canViewOrders: true,
    canAssignDriver: false,
    canChangeStatus: false,
    canManageDirectories: false,
    canViewReports: false,
    canViewFinancialReports: false,
    canExportData: false,
    canEditProfile: true,
    canEnable2FA: true,
  },
};

// Функция для получения прав пользователя
export function getPermissions(role: string): Permissions {
  return (
    permissions[role] || {
      canManageUsers: false,
      canViewUsers: false,
      canCreateOrders: false,
      canEditOrders: false,
      canDeleteOrders: false,
      canViewOrders: false,
      canAssignDriver: false,
      canChangeStatus: false,
      canManageDirectories: false,
      canViewReports: false,
      canViewFinancialReports: false,
      canExportData: false,
      canEditProfile: true,
      canEnable2FA: true,
    }
  );
}

// Проверка, является ли пользователь администратором
export function isAdmin(role: string): boolean {
  return role === Role.ADMIN;
}
