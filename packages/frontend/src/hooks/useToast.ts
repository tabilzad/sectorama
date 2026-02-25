import { useState, useRef, useCallback } from 'react';

export interface ToastMsg {
  level: 'ok' | 'info' | 'error';
  title: string;
  body?: string;
}

export function useToast(defaultDurationMs = 6000) {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const timerRef          = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: ToastMsg, durationMs?: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(msg);
    timerRef.current = setTimeout(() => setToast(null), durationMs ?? defaultDurationMs);
  }, [defaultDurationMs]);

  const dismissToast = useCallback(() => setToast(null), []);

  return { toast, showToast, dismissToast };
}
