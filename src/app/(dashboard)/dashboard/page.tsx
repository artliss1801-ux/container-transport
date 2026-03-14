"use client";

import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { FileText, Truck, Package, TrendingUp } from "lucide-react";

export default function DashboardPage() {
  const { data: session } = useSession();

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const response = await fetch("/api/analytics");
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
  });

  const summary = analytics?.summary || {
    totalOrders: 0,
    newOrders: 0,
    inProgressOrders: 0,
    deliveredOrders: 0,
    totalWeight: 0,
  };

  const cards = [
    {
      title: "Всего заявок",
      value: summary.totalOrders,
      icon: FileText,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Новые заявки",
      value: summary.newOrders,
      icon: Package,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
    },
    {
      title: "В пути",
      value: summary.inProgressOrders,
      icon: Truck,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Общий вес (т)",
      value: summary.totalWeight.toFixed(1),
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header title="Главная" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            Добро пожаловать, {session?.user?.name || "Пользователь"}!
          </h2>
          <p className="text-gray-600 mt-1">
            Обзор вашей деятельности в системе
          </p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {cards.map((card) => (
            <Card key={card.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      {card.title}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {isLoading ? "..." : card.value}
                    </p>
                  </div>
                  <div className={`p-3 rounded-full ${card.bgColor}`}>
                    <card.icon className={`w-6 h-6 ${card.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Быстрые действия</CardTitle>
              <CardDescription>
                Часто используемые операции
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <a
                href="/orders"
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <FileText className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">Создать заявку</p>
                  <p className="text-sm text-gray-500">Новая заявка на перевозку</p>
                </div>
              </a>
              <a
                href="/reports"
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <TrendingUp className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">Отчеты</p>
                  <p className="text-sm text-gray-500">Аналитика и статистика</p>
                </div>
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Статистика по статусам</CardTitle>
              <CardDescription>
                Распределение заявок по статусам
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Новые</span>
                  <span className="font-medium">{summary.newOrders}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">В пути</span>
                  <span className="font-medium">{summary.inProgressOrders}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Доставлены</span>
                  <span className="font-medium">{summary.deliveredOrders}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Отменены</span>
                  <span className="font-medium">{summary.cancelledOrders}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
