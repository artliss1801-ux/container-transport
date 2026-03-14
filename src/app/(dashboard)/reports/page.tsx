"use client";

import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#ef4444"];

export default function ReportsPage() {
  const { toast } = useToast();

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const response = await fetch("/api/analytics");
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
  });

  const handleExport = async () => {
    try {
      const response = await fetch("/api/orders?export=csv");
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orders-${format(new Date(), "yyyy-MM-dd", { locale: ru })}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Экспорт завершен",
        description: "Файл успешно загружен",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Ошибка экспорта",
      });
    }
  };

  const statusData = analytics?.statusData || [];
  const dailyOrders = analytics?.dailyOrders || [];
  const summary = analytics?.summary || {};

  return (
    <div className="flex flex-col h-full">
      <Header title="Отчеты и аналитика" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Аналитика</h2>
            <p className="text-gray-600">Статистика и отчеты по перевозкам</p>
          </div>
          <Button onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Экспорт в CSV
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Всего заявок</p>
              <p className="text-2xl font-bold">{summary.totalOrders || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Новые</p>
              <p className="text-2xl font-bold text-blue-600">{summary.newOrders || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">В пути</p>
              <p className="text-2xl font-bold text-purple-600">{summary.inProgressOrders || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Доставлены</p>
              <p className="text-2xl font-bold text-green-600">{summary.deliveredOrders || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Общий вес (т)</p>
              <p className="text-2xl font-bold">{summary.totalWeight?.toFixed(1) || "0.0"}</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie chart */}
          <Card>
            <CardHeader>
              <CardTitle>Заявки по статусам</CardTitle>
              <CardDescription>
                Распределение заявок по текущим статусам
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-80 flex items-center justify-center">
                  <p className="text-gray-500">Загрузка...</p>
                </div>
              ) : statusData.length === 0 ? (
                <div className="h-80 flex items-center justify-center">
                  <p className="text-gray-500">Нет данных</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name} (${(percent * 100).toFixed(0)}%)`
                      }
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Line chart */}
          <Card>
            <CardHeader>
              <CardTitle>Динамика перевозок</CardTitle>
              <CardDescription>
                Количество заявок за последние 30 дней
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-80 flex items-center justify-center">
                  <p className="text-gray-500">Загрузка...</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={dailyOrders}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => format(new Date(value), "dd.MM", { locale: ru })}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) =>
                        format(new Date(value), "dd MMMM yyyy", { locale: ru })
                      }
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#3b82f6"
                      name="Количество заявок"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
