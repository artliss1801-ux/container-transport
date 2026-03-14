"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, Download, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  NEW: { label: "Новая", variant: "default" },
  IN_PROGRESS: { label: "В пути", variant: "secondary" },
  DELIVERED: { label: "Доставлена", variant: "outline" },
  CANCELLED: { label: "Отменена", variant: "destructive" },
};

interface Order {
  id: string;
  orderNumber: string;
  loadingDatetime: string;
  loadingCity: string;
  loadingAddress: string;
  unloadingCity: string;
  unloadingAddress: string;
  containerNumber: string;
  containerType: { id: string; name: string };
  cargoWeight: number;
  status: string;
  driver: { id: string; fullName: string } | null;
  vehicle: { id: string; vehicleNumber: string; trailerNumber: string | null } | null;
  notes: string | null;
}

export default function OrdersPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    loadingDatetime: "",
    loadingCity: "",
    loadingAddress: "",
    unloadingCity: "",
    unloadingAddress: "",
    containerNumber: "",
    containerTypeId: "",
    cargoWeight: "",
    status: "NEW",
    driverId: "",
    vehicleId: "",
    notes: "",
  });

  // Fetch orders
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["orders", search, statusFilter, dateFrom, dateTo, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom.toISOString());
      if (dateTo) params.set("dateTo", dateTo.toISOString());
      params.set("page", page.toString());

      const response = await fetch(`/api/orders?${params}`);
      if (!response.ok) throw new Error("Failed to fetch orders");
      return response.json();
    },
  });

  // Fetch drivers
  const { data: drivers } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const response = await fetch("/api/drivers");
      if (!response.ok) throw new Error("Failed to fetch drivers");
      return response.json();
    },
  });

  // Fetch vehicles
  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const response = await fetch("/api/vehicles");
      if (!response.ok) throw new Error("Failed to fetch vehicles");
      return response.json();
    },
  });

  // Fetch container types
  const { data: containerTypes } = useQuery({
    queryKey: ["containerTypes"],
    queryFn: async () => {
      const response = await fetch("/api/container-types");
      if (!response.ok) throw new Error("Failed to fetch container types");
      return response.json();
    },
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = editingOrder ? `/api/orders/${editingOrder.id}` : "/api/orders";
      const method = editingOrder ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          cargoWeight: parseFloat(data.cargoWeight),
          driverId: data.driverId || null,
          vehicleId: data.vehicleId || null,
          notes: data.notes || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save order");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      toast({
        title: editingOrder ? "Заявка обновлена" : "Заявка создана",
        description: editingOrder
          ? "Изменения успешно сохранены"
          : "Новая заявка успешно создана",
      });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete order");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      toast({ title: "Заявка удалена" });
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    },
  });

  // Export to CSV
  const exportMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams();
      params.set("export", "csv");
      if (search) params.set("search", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom.toISOString());
      if (dateTo) params.set("dateTo", dateTo.toISOString());

      const response = await fetch(`/api/orders?${params}`);
      if (!response.ok) throw new Error("Failed to export");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orders-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({ title: "Экспорт завершен", description: "Файл загружен" });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Ошибка экспорта",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      loadingDatetime: "",
      loadingCity: "",
      loadingAddress: "",
      unloadingCity: "",
      unloadingAddress: "",
      containerNumber: "",
      containerTypeId: "",
      cargoWeight: "",
      status: "NEW",
      driverId: "",
      vehicleId: "",
      notes: "",
    });
    setEditingOrder(null);
  };

  const openEditDialog = (order: Order) => {
    setEditingOrder(order);
    setFormData({
      loadingDatetime: new Date(order.loadingDatetime).toISOString().slice(0, 16),
      loadingCity: order.loadingCity,
      loadingAddress: order.loadingAddress,
      unloadingCity: order.unloadingCity,
      unloadingAddress: order.unloadingAddress,
      containerNumber: order.containerNumber,
      containerTypeId: order.containerType.id,
      cargoWeight: order.cargoWeight.toString(),
      status: order.status,
      driverId: order.driver?.id || "",
      vehicleId: order.vehicle?.id || "",
      notes: order.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="flex flex-col h-full">
      <Header title="Заявки" />
      <main className="flex-1 p-6 overflow-auto">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Список заявок</CardTitle>
                <CardDescription>
                  Управление заявками на перевозку
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportMutation.mutate()}
                  disabled={exportMutation.isPending}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Экспорт
                </Button>
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Новая заявка
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Поиск по номеру, контейнеру..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Все статусы</SelectItem>
                  <SelectItem value="NEW">Новые</SelectItem>
                  <SelectItem value="IN_PROGRESS">В пути</SelectItem>
                  <SelectItem value="DELIVERED">Доставлены</SelectItem>
                  <SelectItem value="CANCELLED">Отменены</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full sm:w-auto">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {dateFrom || dateTo
                      ? `${dateFrom ? format(dateFrom, "dd.MM.yyyy", { locale: ru }) : "..."} - ${dateTo ? format(dateTo, "dd.MM.yyyy", { locale: ru }) : "..."}`
                      : "Период"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <div className="p-4 space-y-4">
                    <div>
                      <Label className="text-xs">От</Label>
                      <Calendar
                        mode="single"
                        selected={dateFrom}
                        onSelect={setDateFrom}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">До</Label>
                      <Calendar
                        mode="single"
                        selected={dateTo}
                        onSelect={setDateTo}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setDateFrom(undefined);
                        setDateTo(undefined);
                      }}
                    >
                      Сбросить
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>№ заявки</TableHead>
                    <TableHead>Дата загрузки</TableHead>
                    <TableHead>Маршрут</TableHead>
                    <TableHead>Контейнер</TableHead>
                    <TableHead>Вес (т)</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Водитель</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        Загрузка...
                      </TableCell>
                    </TableRow>
                  ) : ordersData?.orders?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        Заявки не найдены
                      </TableCell>
                    </TableRow>
                  ) : (
                    ordersData?.orders?.map((order: Order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          {order.orderNumber}
                        </TableCell>
                        <TableCell>
                          {format(new Date(order.loadingDatetime), "dd.MM.yyyy HH:mm", { locale: ru })}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{order.loadingCity}</div>
                            <div className="text-gray-500">→ {order.unloadingCity}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">{order.containerNumber}</div>
                            <div className="text-gray-500">{order.containerType.name}</div>
                          </div>
                        </TableCell>
                        <TableCell>{order.cargoWeight}</TableCell>
                        <TableCell>
                          <Badge variant={statusMap[order.status]?.variant || "default"}>
                            {statusMap[order.status]?.label || order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{order.driver?.fullName || "-"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(order)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-600"
                                onClick={() => {
                                  setOrderToDelete(order);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {ordersData?.pagination && ordersData.pagination.totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Назад
                </Button>
                <span className="flex items-center px-3 text-sm">
                  {page} / {ordersData.pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === ordersData.pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Далее
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingOrder ? "Редактировать заявку" : "Новая заявка"}
              </DialogTitle>
              <DialogDescription>
                Заполните информацию о заявке на перевозку
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="col-span-2">
                  <Label>Дата и время загрузки</Label>
                  <Input
                    type="datetime-local"
                    value={formData.loadingDatetime}
                    onChange={(e) => setFormData({ ...formData, loadingDatetime: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label>Город загрузки</Label>
                  <Input
                    value={formData.loadingCity}
                    onChange={(e) => setFormData({ ...formData, loadingCity: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Город выгрузки</Label>
                  <Input
                    value={formData.unloadingCity}
                    onChange={(e) => setFormData({ ...formData, unloadingCity: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label>Адрес загрузки</Label>
                  <Input
                    value={formData.loadingAddress}
                    onChange={(e) => setFormData({ ...formData, loadingAddress: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Адрес выгрузки</Label>
                  <Input
                    value={formData.unloadingAddress}
                    onChange={(e) => setFormData({ ...formData, unloadingAddress: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label>Номер контейнера</Label>
                  <Input
                    value={formData.containerNumber}
                    onChange={(e) => setFormData({ ...formData, containerNumber: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Тип контейнера</Label>
                  <Select
                    value={formData.containerTypeId}
                    onValueChange={(value) => setFormData({ ...formData, containerTypeId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите тип" />
                    </SelectTrigger>
                    <SelectContent>
                      {containerTypes?.map((ct: any) => (
                        <SelectItem key={ct.id} value={ct.id}>
                          {ct.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Вес груза (тонны)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.cargoWeight}
                    onChange={(e) => setFormData({ ...formData, cargoWeight: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Статус</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NEW">Новая</SelectItem>
                      <SelectItem value="IN_PROGRESS">В пути</SelectItem>
                      <SelectItem value="DELIVERED">Доставлена</SelectItem>
                      <SelectItem value="CANCELLED">Отменена</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Водитель</Label>
                  <Select
                    value={formData.driverId}
                    onValueChange={(value) => setFormData({ ...formData, driverId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите водителя" />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers?.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Транспорт</Label>
                  <Select
                    value={formData.vehicleId}
                    onValueChange={(value) => setFormData({ ...formData, vehicleId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите транспорт" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles?.map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.vehicleNumber} {v.trailerNumber ? `/ ${v.trailerNumber}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2">
                  <Label>Примечания</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                  Отмена
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Сохранение..." : "Сохранить"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Удалить заявку?</DialogTitle>
              <DialogDescription>
                Вы уверены, что хотите удалить заявку {orderToDelete?.orderNumber}?
                Это действие нельзя отменить.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={() => orderToDelete && deleteMutation.mutate(orderToDelete.id)}
                disabled={deleteMutation.isPending}
              >
                Удалить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
