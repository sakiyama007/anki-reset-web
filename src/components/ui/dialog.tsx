'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'backdrop:bg-black/50 rounded-xl p-0 bg-background text-foreground',
        'max-w-md w-[90vw] shadow-xl',
        className,
      )}
    >
      <div className="p-6">{children}</div>
    </dialog>
  );
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold mb-4">{children}</h2>;
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2 mt-6">{children}</div>;
}
