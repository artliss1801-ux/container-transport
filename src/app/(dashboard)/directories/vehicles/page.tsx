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

interface Vehicle {
  id: string;
  vehicleNumber: string;
  trailerNumber: string | null;
  brand: string | null;
  vehicleType: string | null;
  isActive: boolean;
}

export default function VehiclesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);

  const [formData, setFormData] = useState({
    vehicleNumber: "",
    trailerNumber: "",
    brand: "",
    vehicleType: "",
  });

  const isAdmin = session?.user?.role === "ADMIN";

  // Redirect non-admin users
  useEffect(() => {
    if (status === "authenticated" && !isAdmin) {
      router.push("/dashboard");
    }
  }, [status, isAdmin, router]);

  // Fetch vehicles
  const { data: vehicles, isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const response = await fetch("/api/vehicles");
      if (!response.ok) throw new Error("Failed to fetch vehicles");
      return response.json();
    },
    enabled: isAdmin,
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = editingVehicle ? `/api/vehicles/${editingVehicle.id}` : "/api/vehicles";
      const method = editingVehicle ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          trailerNumber: data.trailerNumber || null,
          brand: data.brand || null,
          vehicleType: data.vehicleType || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save vehicle");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast({
        title: editingVehicle ? "Транспорт обновлен" : "Транспорт добавлен",
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
      const response = await fetch(`/api/vehicles/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete vehicle");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast({ title: "Транспорт удален" });
      setDeleteDialogOpen(false);
      setVehicleToDelete(null);
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
      vehicleNumber: "",
      trailerNumber: "",
      brand: "",
      vehicleType: "",
    });
    setEditingVehicle(null);
  };

  const openEditDialog = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      vehicleNumber: vehicle.vehicleNumber,
      trailerNumber: vehicle.trailerNumber || "",
      brand: vehicle.brand || "",
      vehicleType: vehicle.vehicleType || "",
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
      <Header title="Транспортные средства" />
      <main className="flex-1 p-6 overflow-auto">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Справочник транспорта</CardTitle>
                <CardDescription>
                  Управление списком транспортных средств
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Добавить транспорт
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Госномер авто</TableHead>
                    <TableHead>Госномер прицепа</TableHead>
                    <TableHead>Марка</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        Загрузка...
                      </TableCell>
                    </TableRow>
                  ) : vehicles?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        Транспорт не найден
                      </TableCell>
                    </TableRow>
                  ) : (
                    vehicles?.map((vehicle: Vehicle) => (
                      <TableRow key={vehicle.id}>
                        <TableCell className="font-medium">{vehicle.vehicleNumber}</TableCell>
                        <TableCell>{vehicle.trailerNumber || "-"}</TableCell>
                        <TableCell>{vehicle.brand || "-"}</TableCell>
                        <TableCell>{vehicle.vehicleType || "-"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(vehicle)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-600"
                              onClick={() => {
                                setVehicleToDelete(vehicle);
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
                {editingVehicle ? "Редактировать транспорт" : "Новое транспортное средство"}
              </DialogTitle>
              <DialogDescription>
                Введите данные транспортного средства
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Госномер автомобиля *</Label>
                  <Input
                    value={formData.vehicleNumber}
                    onChange={(e) => setFormData({ ...formData, vehicleNumber: e.target.value })}
                    placeholder="А123БВ777"
                    required
                  />
                </div>
                <div>
                  <Label>Госномер прицепа</Label>
                  <Input
                    value={formData.trailerNumber}
                    onChange={(e) => setFormData({ ...formData, trailerNumber: e.target.value })}
                    placeholder="АВ12345"
                  />
                </div>
                <div>
                  <Label>Марка</Label>
                  <Input
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="Volvo, Scania, MAN..."
                  />
                </div>
                <div>
                  <Label>Тип</Label>
                  <Input
                    value={formData.vehicleType}
                    onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
                    placeholder="Тягач, Фура..."
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
              <DialogTitle>Удалить транспорт?</DialogTitle>
              <DialogDescription>
                Вы уверены, что хотите удалить {vehicleToDelete?.vehicleNumber}?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={() => vehicleToDelete && deleteMutation.mutate(vehicleToDelete.id)}
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
