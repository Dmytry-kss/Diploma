import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

type Variant = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  variant: Variant;
}

interface ToastContextValue {
  success: (message: string) => void;
  error:   (message: string) => void;
  info:    (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CFG = {
  success: { cls: 'bg-green-600', Icon: CheckCircle },
  error:   { cls: 'bg-red-600',   Icon: AlertCircle },
  info:    { cls: 'bg-indigo-600', Icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerMap = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    clearTimeout(timerMap.current[id]);
    delete timerMap.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback((message: string, variant: Variant) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, variant }]);
    timerMap.current[id] = setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const value: ToastContextValue = {
    success: (msg) => add(msg, 'success'),
    error:   (msg) => add(msg, 'error'),
    info:    (msg) => add(msg, 'info'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
          {toasts.map(({ id, message, variant }) => {
            const { cls, Icon } = VARIANT_CFG[variant];
            return (
              <div
                key={id}
                className={`${cls} text-white flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg max-w-xs pointer-events-auto`}
              >
                <Icon size={16} className="flex-shrink-0" />
                <span className="text-sm font-medium flex-1">{message}</span>
                <button
                  onClick={() => dismiss(id)}
                  className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
