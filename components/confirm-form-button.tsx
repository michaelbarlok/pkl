"use client";

/**
 * Wraps a Next.js server-action form with a confirm modal before submitting.
 * Use this anywhere a <form action={serverAction}> needs confirmation.
 */

import { useRef } from "react";
import { useConfirm } from "@/components/confirm-modal";

interface ConfirmFormButtonProps {
  /** The server action to call on confirm */
  action: (fd: FormData) => void | Promise<void>;
  /** Hidden inputs to include in the form */
  hiddenInputs?: Record<string, string>;
  /** Button label */
  label: string;
  /** Confirm modal title */
  confirmTitle: string;
  confirmDescription?: string;
  confirmLabel?: string;
  variant?: "danger" | "warning";
  className?: string;
}

export function ConfirmFormButton({
  action,
  hiddenInputs = {},
  label,
  confirmTitle,
  confirmDescription,
  confirmLabel,
  variant = "danger",
  className,
}: ConfirmFormButtonProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const confirm = useConfirm();

  async function handleClick() {
    const ok = await confirm({
      title: confirmTitle,
      description: confirmDescription,
      confirmLabel: confirmLabel ?? label,
      variant,
    });
    if (ok) formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={action} className="inline">
      {Object.entries(hiddenInputs).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="button" onClick={handleClick} className={className}>
        {label}
      </button>
    </form>
  );
}
