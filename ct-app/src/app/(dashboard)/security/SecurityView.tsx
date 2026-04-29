"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/components/SessionProvider";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield, Monitor, Smartphone, Tablet, 
  MapPin, RefreshCw, User, LogOut, Unlock,
  UserX, Globe, Clock, Trash2, History, FileText, Filter,
  Settings, Timer, Save
} from "lucide-react";

interface ActiveSession {
  id: string;
  sessionId: string;
  loginAt: string;
  lastActivity?: string;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  ipAddress: string | null;
  country: string | null;
  city: string | null;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  };
}

interface BlockedUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  _count: {
    revokedSessions: number;
  };
}

interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  details: string | null;
  description: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  } | null;
}

interface SystemSetting {
  key: string;
  value: string;
  label: string | null;
  updatedAt: string;
}

export default function SecurityPage() {
  const session = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("active");

  // System settings
  const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(30);
  const [savingTimeout, setSavingTimeout] = useState(false);

  // Audit filters
  const [auditActionFilter, setAuditActionFilter] = useState<string>("");
  const [auditEntityTypeFilter, setAuditEntityTypeFilter] = useState<string>("");
  const [auditDateFrom, setAuditDateFrom] = useState<string>("");
  const [auditDateTo, setAuditDateTo] = useState<string>("");

  // Dialogs
  const [blockSessionDialog, setBlockSessionDialog] = useState(false);
  const [sessionToBlock, setSessionToBlock] = useState<ActiveSession | null>(null);
  const [blocking, setBlocking] = useState(false);

  const [unblockDialogOpen, setUnblockDialogOpen] = useState(false);
  const [userToUnblock, setUserToUnblock] = useState<BlockedUser | null>(null);
  const [unblocking, setUnblocking] = useState(false);
  
  const [clearBlocksDialogOpen, setClearBlocksDialogOpen] = useState(false);
  const [clearingBlocks, setClearingBlocks] = useState(false);

  // Session timeout save lock
  const [timeoutSaveLock, setTimeoutSaveLock] = useState(false);

  // Redirect non-admins
  useEffect(() => {
    if (session.loading) return;
    if (!session.authenticated || session.user?.role !== "ADMIN") {
      router.push("/dashboard");
    }
  }, [session.loading, session.authenticated, session.user?.role, router]);

  // Fetch active sessions
  const fetchActiveSessions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("type", "active");

      const response = await fetch(`/api/security/login-history?${params}`);
      if (!response.ok) throw new Error("Failed to fetch active sessions");
      
      const data = await response.json();
      setActiveSessions(data.activeSessions || []);
    } catch (error) {
      console.error("Error fetching active sessions:", error);
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось загрузить активные сессии",
      });
    } finally {
      setLoading(false);
    }
  };

  // Silent fetch — без индикатора загрузки и тостов (для автообновления)
  const fetchActiveSessionsSilent = async () => {
    try {
      const params = new URLSearchParams();
      params.set("type", "active");
      const response = await fetch(`/api/security/login-history?${params}`);
      if (!response.ok) return;
      const data = await response.json();
      setActiveSessions(data.activeSessions || []);
    } catch {}
  };

  // Fetch blocked users
  const fetchBlockedUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("type", "blocked");

      const response = await fetch(`/api/security/login-history?${params}`);
      if (!response.ok) throw new Error("Failed to fetch blocked users");
      
      const data = await response.json();
      setBlockedUsers(data.blockedUsers || []);
    } catch (error) {
      console.error("Error fetching blocked users:", error);
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось загрузить заблокированных пользователей",
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch audit logs (interaction history)
  const fetchAuditLogs = async (page = 1, silent = false) => {
    // silent mode for auto-refresh - don't show loading indicator
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "50");
      if (auditActionFilter) params.set("action", auditActionFilter);
      if (auditEntityTypeFilter) params.set("entityType", auditEntityTypeFilter);
      if (auditDateFrom) params.set("dateFrom", auditDateFrom);
      if (auditDateTo) params.set("dateTo", auditDateTo);

      const response = await fetch(`/api/audit?${params}`);
      if (!response.ok) throw new Error("Failed to fetch audit logs");
      
      const data = await response.json();
      setAuditLogs(data.logs || []);
      setAuditTotal(data.total || 0);
      setAuditPage(page);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      if (!silent) {
        toast({
          variant: "destructive",
          title: "Ошибка",
          description: "Не удалось загрузить историю взаимодействий",
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Fetch system settings
  const fetchSystemSettings = async () => {
    try {
      const response = await fetch("/api/admin/system-settings");
      if (!response.ok) throw new Error("Failed to fetch settings");
      const data = await response.json();
      setSystemSettings(data.settings || []);
      const timeoutSetting = (data.settings || []).find(
        (s: SystemSetting) => s.key === "session_timeout_minutes"
      );
      if (timeoutSetting) {
        setSessionTimeoutMinutes(parseInt(timeoutSetting.value, 10) || 30);
      }
    } catch (error) {
      console.error("Error fetching system settings:", error);
    }
  };

  // Save session timeout
  const handleSaveTimeout = async () => {
    if (timeoutSaveLock) return;
    setTimeoutSaveLock(true);
    setSavingTimeout(true);
    try {
      const response = await fetch("/api/admin/system-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "session_timeout_minutes", value: String(sessionTimeoutMinutes) }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save");
      }
      toast({
        title: "Настройка сохранена",
        description: `Таймер бездействия установлен: ${sessionTimeoutMinutes} мин.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось сохранить настройку",
      });
    } finally {
      setSavingTimeout(false);
      setTimeoutSaveLock(false);
    }
  };

  useEffect(() => {
    if (session.user?.role === "ADMIN") {
      if (activeTab === "active") {
        fetchActiveSessions();
      } else if (activeTab === "blocked") {
        fetchBlockedUsers();
      } else if (activeTab === "history") {
        fetchAuditLogs(1);
      } else if (activeTab === "settings") {
        fetchSystemSettings();
      }
    }
  }, [session.user?.role, session.authenticated, session.loading, activeTab, auditActionFilter, auditEntityTypeFilter, auditDateFrom, auditDateTo]);

  // Автообновление активных сессий каждые 5 секунд (без моргания)
  useEffect(() => {
    if (session.user?.role !== "ADMIN" || activeTab !== "active") return;

    const interval = setInterval(() => {
      fetchActiveSessionsSilent();
    }, 5000);

    return () => clearInterval(interval);
  }, [session.user?.role, activeTab]);

  // Автообновление истории взаимодействий каждые 5 секунд (без моргания)
  useEffect(() => {
    if (session.user?.role !== "ADMIN" || activeTab !== "history") return;

    const interval = setInterval(() => {
      fetchAuditLogs(auditPage, true); // silent mode - без индикатора загрузки
    }, 5000);

    return () => clearInterval(interval);
  }, [session.user?.role, activeTab, auditPage, auditActionFilter, auditEntityTypeFilter]);

  // Block session
  const handleBlockSession = async () => {
    if (!sessionToBlock) return;
    
    setBlocking(true);
    try {
      const response = await fetch(`/api/security/login-history?sessionId=${sessionToBlock.sessionId}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to block session");
      }
      
      toast({
        title: "Сессия заблокирована",
        description: `Сессия пользователя ${sessionToBlock.user.email} была заблокирована`,
      });
      
      fetchActiveSessions();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось заблокировать сессию",
      });
    } finally {
      setBlocking(false);
      setBlockSessionDialog(false);
      setSessionToBlock(null);
    }
  };

  // Unblock user
  const handleUnblockUser = async () => {
    if (!userToUnblock) return;
    
    setUnblocking(true);
    try {
      const response = await fetch("/api/security/login-history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "unblock",
          userId: userToUnblock.id,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to unblock user");
      }
      
      toast({
        title: "Пользователь разблокирован",
        description: `${userToUnblock.email} теперь может войти в систему`,
      });
      
      fetchBlockedUsers();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось разблокировать пользователя",
      });
    } finally {
      setUnblocking(false);
      setUnblockDialogOpen(false);
      setUserToUnblock(null);
    }
  };

  // Clear all blocks
  const handleClearAllBlocks = async () => {
    setClearingBlocks(true);
    try {
      const response = await fetch("/api/admin/clear-all-blocks", {
        method: "POST",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to clear blocks");
      }
      
      const data = await response.json();
      
      toast({
        title: "Блокировки очищены",
        description: `Удалено ${data.deletedRevokedSessions} записей блокировок. Все пользователи могут войти в систему.`,
      });
      
      fetchBlockedUsers();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось очистить блокировки",
      });
    } finally {
      setClearingBlocks(false);
      setClearBlocksDialogOpen(false);
    }
  };

  // Get device icon
  const getDeviceIcon = (deviceType: string | null) => {
    switch (deviceType) {
      case "mobile":
        return <Smartphone className="w-4 h-4" />;
      case "tablet":
        return <Tablet className="w-4 h-4" />;
      default:
        return <Monitor className="w-4 h-4" />;
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "Неизвестно";
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Format relative time
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "Неизвестно";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "только что";
    if (diffMins < 60) return `${diffMins} мин. назад`;
    if (diffHours < 24) return `${diffHours} ч. назад`;
    if (diffDays < 7) return `${diffDays} дн. назад`;
    return formatDate(dateStr);
  };

  // Get action label in Russian
  const getActionLabel = (action: string): string => {
    const labels: Record<string, string> = {
      CREATE: "Создание",
      UPDATE: "Изменение",
      DELETE: "Удаление",
      LOGIN: "Вход",
      LOGOUT: "Выход",
      VIEW: "Просмотр",
      EXPORT: "Экспорт",
      IMPORT: "Импорт",
      BLOCK: "Блокировка",
      UNBLOCK: "Разблокировка",
      STATUS_CHANGE: "Статус",
      ASSIGN: "Назначение",
      APPROVE: "Одобрение",
      REJECT: "Отклонение",
    };
    return labels[action] || action;
  };

  // Get entity type label in Russian
  const getEntityTypeLabel = (entityType: string): string => {
    const labels: Record<string, string> = {
      ORDER: "Заявка",
      USER: "Пользователь",
      COUNTERPARTY: "Контрагент",
      CLIENT: "Клиент",
      CARRIER: "Перевозчик",
      DRIVER: "Водитель",
      TRUCK: "Тягач",
      TRAILER: "Прицеп",
      CONTRACT: "Договор",
      PORT: "Порт",
      CONTAINER_TYPE: "Тип контейнера",
      BRANCH: "Филиал",
      PERMISSION: "Право доступа",
      LOGIN_SESSION: "Сессия",
      REPORT: "Отчёт",
      OTHER: "Другое",
    };
    return labels[entityType] || entityType;
  };

  // Get action badge color
  const getActionBadgeVariant = (action: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (action) {
      case "CREATE":
        return "default";
      case "UPDATE":
        return "secondary";
      case "DELETE":
        return "destructive";
      case "BLOCK":
        return "destructive";
      case "UNBLOCK":
        return "default";
      case "LOGIN":
      case "LOGOUT":
        return "outline";
      default:
        return "secondary";
    }
  };

  if (session.loading || session.user?.role !== "ADMIN") {
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Безопасность" />
      <main className="flex-1 p-4 md:p-6 overflow-auto min-w-0">
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Безопасность
                </CardTitle>
                <CardDescription>
                  Управление активными сессиями, заблокированными пользователями, историей взаимодействий и настройками безопасности
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => activeTab === "active" ? fetchActiveSessions() : activeTab === "blocked" ? fetchBlockedUsers() : fetchAuditLogs(auditPage)}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Обновить
              </Button>
              {blockedUsers.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200"
                  onClick={() => setClearBlocksDialogOpen(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Очистить блокировки
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="min-w-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0">
              <TabsList className="mb-4">
                <TabsTrigger value="active">
                  <Monitor className="w-4 h-4 mr-2" />
                  Активные сессии
                  {activeSessions.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {activeSessions.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="blocked">
                  <UserX className="w-4 h-4 mr-2" />
                  Заблокированные
                  {blockedUsers.length > 0 && (
                    <Badge variant="destructive" className="ml-2">
                      {blockedUsers.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="history">
                  <History className="w-4 h-4 mr-2" />
                  История взаимодействия
                  {auditTotal > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {auditTotal}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <Settings className="w-4 h-4 mr-2" />
                  Настройки
                </TabsTrigger>
              </TabsList>

              {/* Active Sessions Tab */}
              <TabsContent value="active">
                {loading ? (
                  <div className="text-center py-8 text-slate-500">
                    Загрузка...
                  </div>
                ) : activeSessions.length === 0 ? (
                  <div className="text-center py-12">
                    <Monitor className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500">Нет активных сессий</p>
                    <p className="text-sm text-slate-400 mt-1">
                      Когда пользователи войдут в систему, их сессии появятся здесь
                    </p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <Table className="min-w-[800px]">
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="font-semibold">Пользователь</TableHead>
                          <TableHead className="font-semibold">Устройство</TableHead>
                          <TableHead className="font-semibold">Браузер</TableHead>
                          <TableHead className="font-semibold">Местоположение</TableHead>
                          <TableHead className="font-semibold">IP адрес</TableHead>
                          <TableHead className="font-semibold">Время входа</TableHead>
                          <TableHead className="font-semibold">Действия</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeSessions.map((sessionItem) => (
                          <TableRow key={sessionItem.id} className="hover:bg-slate-50">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                  <User className="w-4 h-4 text-blue-500" />
                                </div>
                                <div>
                                  <div className="font-medium">
                                    {sessionItem.user.name || sessionItem.user.email}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {sessionItem.user.email}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getDeviceIcon(sessionItem.deviceType)}
                                <div>
                                  <div className="text-sm">
                                    {sessionItem.deviceType === "mobile" ? "Телефон" :
                                     sessionItem.deviceType === "tablet" ? "Планшет" : "Компьютер"}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {sessionItem.os || "Неизвестно"}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {sessionItem.browser || "Неизвестно"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                <span className="text-sm">
                                  {sessionItem.city && sessionItem.country
                                    ? `${sessionItem.city}, ${sessionItem.country}`
                                    : sessionItem.country || sessionItem.city || "Неизвестно"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Globe className="w-3 h-3 text-slate-400" />
                                <span className="text-sm font-mono">
                                  {sessionItem.ipAddress || "Неизвестно"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span className="text-sm" title={formatDate(sessionItem.loginAt)}>
                                  {formatRelativeTime(sessionItem.loginAt)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {sessionItem.sessionId && sessionItem.sessionId === session.user?.sessionId ? (
                                <Badge variant="secondary" className="text-green-600">
                                  Текущая сессия
                                </Badge>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                  onClick={() => {
                                    setSessionToBlock(sessionItem);
                                    setBlockSessionDialog(true);
                                  }}
                                >
                                  <LogOut className="w-4 h-4 mr-1" />
                                  Закрыть сессию
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Blocked Users Tab */}
              <TabsContent value="blocked">
                {loading ? (
                  <div className="text-center py-8 text-slate-500">
                    Загрузка...
                  </div>
                ) : blockedUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <Shield className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500">Нет заблокированных пользователей</p>
                    <p className="text-sm text-slate-400 mt-1">
                      Когда вы заблокируете сессию пользователя, он появится здесь
                    </p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="font-semibold">Пользователь</TableHead>
                          <TableHead className="font-semibold">Роль</TableHead>
                          <TableHead className="font-semibold">Кол-во блокировок</TableHead>
                          <TableHead className="font-semibold">Действия</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {blockedUsers.map((user) => (
                          <TableRow key={user.id} className="hover:bg-slate-50">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                  <UserX className="w-4 h-4 text-red-500" />
                                </div>
                                <div>
                                  <div className="font-medium">
                                    {user.name || user.email}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {user.email}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {user.role === "ADMIN" ? "Администратор" : 
                                 user.role === "LOGISTICS_MANAGER" ? "Менеджер по логистике" :
                                 user.role === "ACCOUNTANT" ? "Бухгалтер" : user.role}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {user._count.revokedSessions} блокировок
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                                onClick={() => {
                                  setUserToUnblock(user);
                                  setUnblockDialogOpen(true);
                                }}
                              >
                                <Unlock className="w-4 h-4 mr-1" />
                                Разблокировать
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Interaction History Tab */}
              <TabsContent value="history">
                {/* Filters */}
                <div className="flex flex-wrap gap-3 mb-4 p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-600">Фильтры:</span>
                  </div>
                  <select
                    className="border rounded px-2 py-1 text-sm bg-white"
                    value={auditActionFilter}
                    onChange={(e) => setAuditActionFilter(e.target.value)}
                  >
                    <option value="">Все действия</option>
                    <option value="CREATE">Создание</option>
                    <option value="UPDATE">Изменение</option>
                    <option value="DELETE">Удаление</option>
                    <option value="LOGIN">Вход</option>
                    <option value="LOGOUT">Выход</option>
                    <option value="EXPORT">Экспорт</option>
                    <option value="IMPORT">Импорт</option>
                    <option value="BLOCK">Блокировка</option>
                    <option value="UNBLOCK">Разблокировка</option>
                    <option value="STATUS_CHANGE">Изменение статуса</option>
                  </select>
                  <select
                    className="border rounded px-2 py-1 text-sm bg-white"
                    value={auditEntityTypeFilter}
                    onChange={(e) => setAuditEntityTypeFilter(e.target.value)}
                  >
                    <option value="">Все объекты</option>
                    <option value="ORDER">Заявки</option>
                    <option value="USER">Пользователи</option>
                    <option value="COUNTERPARTY">Контрагенты</option>
                    <option value="CLIENT">Клиенты</option>
                    <option value="CARRIER">Перевозчики</option>
                    <option value="DRIVER">Водители</option>
                    <option value="TRUCK">Тягачи</option>
                    <option value="TRAILER">Прицепы</option>
                    <option value="CONTRACT">Договоры</option>
                    <option value="PORT">Порты</option>
                    <option value="BRANCH">Филиалы</option>
                  </select>
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-slate-500">С:</label>
                    <input
                      type="date"
                      className="border rounded px-2 py-1 text-sm bg-white"
                      value={auditDateFrom}
                      onChange={(e) => setAuditDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-slate-500">По:</label>
                    <input
                      type="date"
                      className="border rounded px-2 py-1 text-sm bg-white"
                      value={auditDateTo}
                      onChange={(e) => setAuditDateTo(e.target.value)}
                    />
                  </div>
                  {(auditActionFilter || auditEntityTypeFilter || auditDateFrom || auditDateTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAuditActionFilter("");
                        setAuditEntityTypeFilter("");
                        setAuditDateFrom("");
                        setAuditDateTo("");
                      }}
                    >
                      Сбросить
                    </Button>
                  )}
                </div>

                {loading ? (
                  <div className="text-center py-8 text-slate-500">
                    Загрузка...
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-center py-12">
                    <History className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500">Нет записей в истории</p>
                    <p className="text-sm text-slate-400 mt-1">
                      Действия пользователей будут отображаться здесь
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="border rounded-lg overflow-hidden">
                      <Table className="w-full table-fixed">
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="font-semibold w-[20%]">Пользователь</TableHead>
                            <TableHead className="font-semibold w-[12%]">Действие</TableHead>
                            <TableHead className="font-semibold w-[18%]">Объект</TableHead>
                            <TableHead className="font-semibold">Описание</TableHead>
                            <TableHead className="font-semibold w-[16%] text-right">Дата и время</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditLogs.map((log) => (
                            <TableRow key={log.id} className="hover:bg-slate-50">
                              <TableCell className="py-2 pr-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                    <User className="w-3.5 h-3.5 text-blue-500" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-medium text-sm truncate">
                                      {log.user?.name || log.user?.email || "Система"}
                                    </div>
                                    <div className="text-xs text-slate-500 truncate">
                                      {log.user?.email || "Автоматическое действие"}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-2 pr-2">
                                <Badge variant={getActionBadgeVariant(log.action)} className="text-xs whitespace-nowrap">
                                  {getActionLabel(log.action)}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-2 pr-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="text-sm font-medium truncate">
                                    {log.entityName || getEntityTypeLabel(log.entityType)}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2 pr-2">
                                <span className="text-sm text-slate-600 truncate block max-w-full" title={log.description || getActionLabel(log.action)}>
                                  {log.description || getActionLabel(log.action)}
                                </span>
                              </TableCell>
                              <TableCell className="py-2 text-right whitespace-nowrap">
                                <span className="text-xs text-slate-500">
                                  {formatDate(log.createdAt)}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {auditTotal > 50 && (
                      <div className="flex items-center justify-between mt-4">
                        <div className="text-sm text-slate-500">
                          Показано {((auditPage - 1) * 50) + 1} - {Math.min(auditPage * 50, auditTotal)} из {auditTotal} записей
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={auditPage === 1}
                            onClick={() => fetchAuditLogs(auditPage - 1)}
                          >
                            Назад
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={auditPage * 50 >= auditTotal}
                            onClick={() => fetchAuditLogs(auditPage + 1)}
                          >
                            Вперёд
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings">
                <div className="space-y-6">
                  {/* Session timeout setting */}
                  <div className="border rounded-lg p-6 bg-white">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Timer className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold">Таймер бездействия сессии</h3>
                        <p className="text-sm text-slate-500">
                          Время бездействия, после которого сессия пользователя будет автоматически закрыта и он будет перенаправлен на страницу входа
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={480}
                          value={sessionTimeoutMinutes}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val >= 1 && val <= 480) {
                              setSessionTimeoutMinutes(val);
                            }
                          }}
                          className="w-24 h-9 border rounded-md px-3 text-center text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <span className="text-sm text-slate-600">минут</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {[5, 10, 15, 30, 60, 120].map((mins) => (
                          <button
                            key={mins}
                            onClick={() => setSessionTimeoutMinutes(mins)}
                            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                              sessionTimeoutMinutes === mins
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50 hover:border-slate-400"
                            }`}
                          >
                            {mins >= 60 ? `${mins / 60} ч` : `${mins} мин`}
                          </button>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        onClick={handleSaveTimeout}
                        disabled={savingTimeout || sessionTimeoutMinutes < 1}
                        className="ml-auto"
                      >
                        <Save className="w-4 h-4 mr-1" />
                        {savingTimeout ? "Сохранение..." : "Сохранить"}
                      </Button>
                    </div>
                    <p className="text-xs text-slate-400 mt-3">
                      Допустимый диапазон: от 1 до 480 минут (8 часов). При изменении настройки все активные сессии будут использовать новое значение при следующей проверке.
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>

      {/* Block Session Confirmation Dialog */}
      <Dialog open={blockSessionDialog} onOpenChange={setBlockSessionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <LogOut className="w-5 h-5" />
              Закрыть сессию
            </DialogTitle>
            <DialogDescription>
              {sessionToBlock && (
                <>
                  Вы уверены, что хотите закрыть сессию пользователя{" "}
                  <strong>{sessionToBlock.user.email}</strong>?
                  <br />
                  Пользователь будет принудительно выведен из системы.
                  <br />
                  Пользователь сможет войти снова с новым логином.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBlockSessionDialog(false);
                setSessionToBlock(null);
              }}
              disabled={blocking}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleBlockSession}
              disabled={blocking}
            >
              {blocking ? "Закрытие..." : "Закрыть сессию"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unblock Confirmation Dialog */}
      <Dialog open={unblockDialogOpen} onOpenChange={setUnblockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Unlock className="w-5 h-5" />
              Разблокировать пользователя
            </DialogTitle>
            <DialogDescription>
              {userToUnblock && (
                <>
                  Вы уверены, что хотите разблокировать пользователя{" "}
                  <strong>{userToUnblock.email}</strong>?
                  <br />
                  После разблокировки пользователь сможет снова войти в систему.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUnblockDialogOpen(false);
                setUserToUnblock(null);
              }}
              disabled={unblocking}
            >
              Отмена
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={handleUnblockUser}
              disabled={unblocking}
            >
              {unblocking ? "Разблокировка..." : "Разблокировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear All Blocks Confirmation Dialog */}
      <Dialog open={clearBlocksDialogOpen} onOpenChange={setClearBlocksDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <Trash2 className="w-5 h-5" />
              Очистить все блокировки
            </DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите очистить все блокировки?
              <br />
              Все заблокированные пользователи смогут снова войти в систему.
              <br />
              <strong>Заблокировано пользователей: {blockedUsers.length}</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setClearBlocksDialogOpen(false)}
              disabled={clearingBlocks}
            >
              Отмена
            </Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700"
              onClick={handleClearAllBlocks}
              disabled={clearingBlocks}
            >
              {clearingBlocks ? "Очистка..." : "Очистить все блокировки"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
