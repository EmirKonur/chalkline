import type { Toast } from '../editor/editor.ts';
import { createStore } from './store.ts';

export interface ShownToast extends Toast {
  id: number;
}

export const toastStore = createStore<{ toasts: readonly ShownToast[] }>({ toasts: [] });

let nextId = 1;

export function showToast(toast: Toast): void {
  const id = nextId++;
  const shown: ShownToast = { ...toast, id };
  toastStore.set((s) => ({
    toasts: [...s.toasts.filter((t) => t.message !== toast.message), shown].slice(-3),
  }));
  setTimeout(() => dismissToast(id), toast.action ? 9000 : 4500);
}

export function dismissToast(id: number): void {
  toastStore.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}
