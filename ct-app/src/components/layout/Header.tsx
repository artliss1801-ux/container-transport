"use client";
import React from "react";

export function Header({ title }: { title: string }) {
  return (
    <header className="border-b bg-white px-6 py-3 flex items-center gap-4 shrink-0">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
    </header>
  );
}

