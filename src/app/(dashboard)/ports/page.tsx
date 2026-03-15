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
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Search } from "lucide-react";

interface Port {
  id: string;
  name: string;
  code: string | null;
  country: string | null;
  notes: string | null;
  isActive: boolean;
}

export default function PortsPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPort, setEditingPort] = useState<Port | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [portToDelete, setPortToDelete] = useState<Port | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    country: "",
    notes: "",
  });

  // Only Admin can manage ports
  const canEdit = session?.user?.role === "ADMIN";

  // Fetch ports
  const { data: ports, isLoading } = useQuery({
    queryKey: ["ports", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const response = await fetch(`/api/ports?${params}`);
      if (!response.ok) throw new Error("Failed to fetch ports");
      return response.json();
    },
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = editingPort ? `/api/ports/${editingPort.id}` : "/api/ports";
      const method = editingPort ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          code: data.code || null,
          country: data.country || null,
          notes: data.notes || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save port");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ports"] });
      toast({
        title: editingPort ? "Порт обновлен" : "Порт создан",
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
      const response = await fetch(`/api/ports/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete port");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ports"] });
      toast({ title: "Порт удален" });
      setDeleteDialogOpen(false);
      setPortToDelete(null);
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
      code: "",
      country: "",
      notes: "",
    });
    setEditingPort(null);
  };

  const openEditDialog = (port: Port) => {
    setEditingPort(port);
    setFormData({
      name: port.name,
      code: port.code || "",
      country: port.country || "",
      notes: port.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Порты" />
      <main className="flex-1 p-6 overflow-auto">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Справочник портов</CardTitle>
                <CardDescription>
                  Управление портами для перевозок
                </CardDescription>
              </div>
              {canEdit && (
                <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Новый порт
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
                  placeholder="Поиск по названию или коду..."
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Код</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Страна</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Примечания</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-20">Действия</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8">
                        Загрузка...
                      </td>
                    </tr>
                  ) : ports?.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8">
                        Порты не найдены
                      </td>
                    </tr>
                  ) : (
                    ports?.map((port: Port) => (
                      <tr key={port.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{port.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{port.code || "-"}</td>
                        <td className="px-4 py-3 text-sm">{port.country || "-"}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-xs">{port.notes || "-"}</td>
                        <td className="px-4 py-3">
                          {canEdit && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(port)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-600"
                                onClick={() => {
                                  setPortToDelete(port);
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingPort ? "Редактировать порт" : "Новый порт"}
              </DialogTitle>
              <DialogDescription>
                Заполните информацию о порте
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                <div className="md:col-span-2">
                  <Label>Название *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Название порта"
                    required
                  />
                </div>
                <div>
                  <Label>Код</Label>
                  <Input
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="RUMMK"
                  />
                </div>
                <div>
                  <Label>Страна</Label>
                  <Input
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="Россия"
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
              <DialogTitle>Удалить порт?</DialogTitle>
              <DialogDescription>
                Вы уверены, что хотите удалить порт "{portToDelete?.name}"?
                Это действие нельзя отменить.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={() => portToDelete && deleteMutation.mutate(portToDelete.id)}
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
