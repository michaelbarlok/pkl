"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";

interface ContactOrganizersButtonProps {
  /** API endpoint to POST the message to */
  endpoint: string;
  /** Label for the button and placeholder text */
  label: string;
}

export function ContactOrganizersButton({ endpoint, label }: ContactOrganizersButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Failed to send message.", "error");
      } else {
        toast("Message sent!", "success");
        setMessage("");
        setOpen(false);
      }
    } catch {
      toast("Failed to send message.", "error");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary text-xs">
        {label}
      </button>
    );
  }

  return (
    <div className="card space-y-2">
      <p className="text-sm font-medium text-dark-200">{label}</p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={`Write a message to the ${label.toLowerCase().replace("contact ", "")}...`}
        aria-label="Message"
        className="input text-sm w-full h-20 resize-none"
        maxLength={500}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="btn-primary btn-sm"
        >
          {sending ? "Sending..." : "Send"}
        </button>
        <button
          onClick={() => { setOpen(false); setMessage(""); }}
          className="text-xs text-dark-300 hover:text-dark-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
