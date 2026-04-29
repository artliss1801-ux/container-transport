import * as React from "react";
const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 5000;

type Toast = { id: string; title?: string; description?: string; variant?: "default" | "destructive" };

const listeners: Array<(toasts: Toast[]) => void> = [];
let memoryState: Toast[] = [];
let count = 0;

function dispatch(toasts: Toast[]) { memoryState = toasts; listeners.forEach((l) => l(toasts)); }

function genId() { count = (count + 1) % Number.MAX_SAFE_INTEGER; return count.toString(); }

export function toast(opts: { title?: string; description?: string; variant?: "default" | "destructive" }) {
  const id = genId();
  dispatch([...memoryState, { id, ...opts }]);
  setTimeout(() => { dispatch(memoryState.filter((t) => t.id !== id)); }, TOAST_REMOVE_DELAY);
  return { id, dismiss: () => dispatch(memoryState.filter((t) => t.id !== id)), update: (p: any) => dispatch(memoryState.map((t) => t.id === id ? { ...t, ...p } : t)) };
}

export function useToast() {
  const [toasts, setToasts] = React.useState<Toast[]>(memoryState);
  React.useEffect(() => { listeners.push(setToasts); return () => { const i = listeners.indexOf(setToasts); if (i > -1) listeners.splice(i, 1); }; }, [toasts]);
  return { toasts, toast, dismiss: (id: string) => dispatch(memoryState.filter((t) => t.id !== id)) };
}

