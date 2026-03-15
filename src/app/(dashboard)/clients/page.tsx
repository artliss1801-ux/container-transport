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
import { Plus, Edit, Trash2, Search } from "lucide-react";

interface Client {
  id: string;
  name: string;
  inn: string | null;
  kpp: string | null;
  address: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
}

export default function ClientsPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    inn: "",
    kpp: "",
    address: "",
    contactPerson: "",
    phone: "",
    email: "",
    notes: "",
  });

  // Check permissions
  const canEdit = session?.user?.role === "ADMIN" || session?.user?.role === "COMMERCIAL_MANAGER";

  // Fetch clients
  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const response = await fetch(`/api/clients?${params}`);
      if (!response.ok) throw new Error("Failed to fetch clients");
      return response.json();
    },
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = editingClient ? `/api/clients/${editingClient.id}` : "/api/clients";
      const method = editingClient ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          inn: data.inn || null,
          kpp: data.kpp || null,
          address: data.address || null,
          contactPerson: data.contactPerson || null,
          phone: data.phone || null,
          email: data.email || null,
          notes: data.notes || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save client");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({
        title: editingClient ? "Клиент обновлен" : "Клиент создан",
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
      const response = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete client");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Клиент удален" });
      setDeleteDialogOpen(false);
      setClientToDelete(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      inn: "",
      kpp: "",
      address: "",
      contactPerson: "",
      phone: "",
      email: "",
      notes: "",
    });
    setEditingClient(null);
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      inn: client.inn || "",
      kpp: client.kpp || "",
      address: client.address || "",
      contactPerson: client.contactPerson || "",
      phone: client.phone || "",
      email: client.email || "",
      notes: client.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Клиенты" />
      <main className="flex-1 p-6 overflow-auto">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Справочник клиентов</CardTitle>
                <CardDescription>
                  Управление клиентами компании
                </CardDescription>
              </div>
              {canEdit && (
                <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Новый клиент
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Search */}
            <div className="flex gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Поиск по названию или ИНН..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Наименование</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ИНН</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">КПП</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Контактное лицо</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Телефон</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-20">Действия</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8">
                        Загрузка...
                      </td>
                    </tr>
                  ) : clients?.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8">
                        Клиенты не найдены
                      </td>
                    </tr>
                  ) : (
                    clients?.map((client: Client) => (
                      <tr key={client.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{client.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{client.inn || "-"}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{client.kpp || "-"}</td>
                        <td className="px-4 py-3 text-sm">{client.contactPerson || "-"}</td>
                        <td className="px-4 py-3 text-sm">{client.phone || "-"}</td>
                        <td className="px-4 py-3 text-sm">{client.email || "-"}</td>
                        <td className="px-4 py-3">
                          {canEdit && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(client)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-600"
                                onClick={() => {
                                  setClientToDelete(client);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingClient ? "Редактировать клиента" : "Новый клиент"}
              </DialogTitle>
              <DialogDescription>
                Заполните информацию о клиенте
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                <div className="md:col-span-2">
                  <Label>Наименование *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>ИНН</Label>
                  <Input
                    value={formData.inn}
                    onChange={(e) => setFormData({ ...formData, inn: e.target.value })}
                    placeholder="1234567890"
                  />
                </div>
                <div>
                  <Label>КПП</Label>
                  <Input
                    value={formData.kpp}
                    onChange={(e) => setFormData({ ...formData, kpp: e.target.value })}
                    placeholder="123456789"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Юридический адрес</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Полный адрес"
                  />
                </div>
                <div>
                  <Label>Контактное лицо</Label>
                  <Input
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    placeholder="ФИО"
                  />
                </div>
                <div>
                  <Label>Телефон</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+7 (999) 123-45-67"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="md:col-span-2">
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
              <DialogTitle>Удалить клиента?</DialogTitle>
              <DialogDescription>
                Вы уверены, что хотите удалить клиента "{clientToDelete?.name}"?
                Это действие нельзя отменить.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={() => clientToDelete && deleteMutation.mutate(clientToDelete.id)}
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
