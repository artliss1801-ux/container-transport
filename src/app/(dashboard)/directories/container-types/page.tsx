"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2 } from "lucide-react";

interface ContainerType {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
}

export default function ContainerTypesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ContainerType | null>(null);
  const [typeToDelete, setTypeToDelete] = useState<ContainerType | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
  });

  const isAdmin = session?.user?.role === "ADMIN";

  // Redirect non-admin users
  useEffect(() => {
    if (status === "authenticated" && !isAdmin) {
      router.push("/dashboard");
    }
  }, [status, isAdmin, router]);

  // Fetch container types
  const { data: containerTypes, isLoading } = useQuery({
    queryKey: ["containerTypes"],
    queryFn: async () => {
      const response = await fetch("/api/container-types");
      if (!response.ok) throw new Error("Failed to fetch container types");
      return response.json();
    },
    enabled: isAdmin,
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = editingType ? `/api/container-types/${editingType.id}` : "/api/container-types";
      const method = editingType ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          code: data.code || null,
          description: data.description || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save container type");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["containerTypes"] });
      toast({
        title: editingType ? "Тип обновлен" : "Тип добавлен",
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
      const response = await fetch(`/api/container-types/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete container type");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["containerTypes"] });
      toast({ title: "Тип контейнера удален" });
      setDeleteDialogOpen(false);
      setTypeToDelete(null);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Ошибка удаления",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      description: "",
    });
    setEditingType(null);
  };

  const openEditDialog = (type: ContainerType) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      code: type.code || "",
      description: type.description || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Загрузка...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Типы контейнеров" />
      <main className="flex-1 p-6 overflow-auto">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Справочник типов контейнеров</CardTitle>
                <CardDescription>
                  Управление списком типов контейнеров
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Добавить тип
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Код</TableHead>
                    <TableHead>Описание</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        Загрузка...
                      </TableCell>
                    </TableRow>
                  ) : containerTypes?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        Типы контейнеров не найдены
                      </TableCell>
                    </TableRow>
                  ) : (
                    containerTypes?.map((type: ContainerType) => (
                      <TableRow key={type.id}>
                        <TableCell className="font-medium">{type.name}</TableCell>
                        <TableCell>{type.code || "-"}</TableCell>
                        <TableCell>{type.description || "-"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(type)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-600"
                              onClick={() => {
                                setTypeToDelete(type);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingType ? "Редактировать тип" : "Новый тип контейнера"}
              </DialogTitle>
              <DialogDescription>
                Введите данные типа контейнера
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Название *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="20 футов, 40 футов HC..."
                    required
                  />
                </div>
                <div>
                  <Label>Код</Label>
                  <Input
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="20DC, 40HC, 20RF..."
                  />
                </div>
                <div>
                  <Label>Описание</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    placeholder="Описание типа контейнера..."
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
              <DialogTitle>Удалить тип контейнера?</DialogTitle>
              <DialogDescription>
                Вы уверены, что хотите удалить {typeToDelete?.name}?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={() => typeToDelete && deleteMutation.mutate(typeToDelete.id)}
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
