"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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

interface Driver {
  id: string;
  fullName: string;
  phone: string | null;
  licenseNumber: string | null;
  passportData: string | null;
  isActive: boolean;
}

export default function DriversPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [driverToDelete, setDriverToDelete] = useState<Driver | null>(null);

  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    licenseNumber: "",
    passportData: "",
  });

  const isAdmin = session?.user?.role === "ADMIN";

  // Redirect non-admin users
  useEffect(() => {
    if (status === "authenticated" && !isAdmin) {
      router.push("/dashboard");
    }
  }, [status, isAdmin, router]);

  // Fetch drivers
  const { data: drivers, isLoading } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const response = await fetch("/api/drivers");
      if (!response.ok) throw new Error("Failed to fetch drivers");
      return response.json();
    },
    enabled: isAdmin,
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = editingDriver ? `/api/drivers/${editingDriver.id}` : "/api/drivers";
      const method = editingDriver ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          phone: data.phone || null,
          licenseNumber: data.licenseNumber || null,
          passportData: data.passportData || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save driver");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      toast({
        title: editingDriver ? "Водитель обновлен" : "Водитель добавлен",
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
      const response = await fetch(`/api/drivers/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete driver");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      toast({ title: "Водитель удален" });
      setDeleteDialogOpen(false);
      setDriverToDelete(null);
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
      fullName: "",
      phone: "",
      licenseNumber: "",
      passportData: "",
    });
    setEditingDriver(null);
  };

  const openEditDialog = (driver: Driver) => {
    setEditingDriver(driver);
    setFormData({
      fullName: driver.fullName,
      phone: driver.phone || "",
      licenseNumber: driver.licenseNumber || "",
      passportData: driver.passportData || "",
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
      <Header title="Водители" />
      <main className="flex-1 p-6 overflow-auto">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Справочник водителей</CardTitle>
                <CardDescription>
                  Управление списком водителей
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Добавить водителя
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ФИО</TableHead>
                    <TableHead>Телефон</TableHead>
                    <TableHead>Водительское удостоверение</TableHead>
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
                  ) : drivers?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        Водители не найдены
                      </TableCell>
                    </TableRow>
                  ) : (
                    drivers?.map((driver: Driver) => (
                      <TableRow key={driver.id}>
                        <TableCell className="font-medium">{driver.fullName}</TableCell>
                        <TableCell>{driver.phone || "-"}</TableCell>
                        <TableCell>{driver.licenseNumber || "-"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(driver)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-600"
                              onClick={() => {
                                setDriverToDelete(driver);
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
                {editingDriver ? "Редактировать водителя" : "Новый водитель"}
              </DialogTitle>
              <DialogDescription>
                Введите данные водителя
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div>
                  <Label>ФИО *</Label>
                  <Input
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    required
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
                <div>
                  <Label>Номер водительского удостоверения</Label>
                  <Input
                    value={formData.licenseNumber}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Паспортные данные</Label>
                  <Input
                    value={formData.passportData}
                    onChange={(e) => setFormData({ ...formData, passportData: e.target.value })}
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
              <DialogTitle>Удалить водителя?</DialogTitle>
              <DialogDescription>
                Вы уверены, что хотите удалить {driverToDelete?.fullName}?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={() => driverToDelete && deleteMutation.mutate(driverToDelete.id)}
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
