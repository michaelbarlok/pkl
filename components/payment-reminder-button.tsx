"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";

interface Props {
  tournamentId: string;
  unpaidCount: number;
}

export function PaymentReminderButton({ tournamentId, unpaidCount }: Props) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  if (unpaidCount === 0) return null;

  async function handleSend() {
    setSending(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/payment-reminder`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to send reminders.", "error");
      } else {
        toast(
          `Reminder sent to ${data.sent} player${data.sent !== 1 ? "s" : ""}.`,
          "success"
        );
        setConfirming(false);
      }
    } catch {
      toast("Failed to send reminders.", "error");
    } finally {
      setSending(false);
    }
  }

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="btn-secondary text-xs">
        Send Payment Reminder ({unpaidCount} unpaid)
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-overlay border border-surface-border px-3 py-2">
      <p className="text-sm text-dark-200 flex-1 min-w-0">
        Email a payment reminder to{" "}
        <strong>{unpaidCount} unpaid registrant{unpaidCount !== 1 ? "s" : ""}</strong>?
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleSend}
          disabled={sending}
          className="btn-primary btn-sm"
        >
          {sending ? "Sending..." : "Send"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-dark-300 hover:text-dark-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
