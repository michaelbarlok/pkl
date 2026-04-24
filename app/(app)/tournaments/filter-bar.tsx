"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useTransition } from "react";

/**
 * Filter controls for the tournaments list. Each change pushes the
 * current state into the URL so links are shareable and the server
 * component re-renders with the new filter set. Location is a
 * debounced free-text box; the others are select dropdowns with
 * an "Any" option that removes the param.
 */
export function TournamentFilterBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [location, setLocation] = useState(params.get("location") ?? "");

  // Keep local input in sync if the URL changes externally (e.g. Back).
  useEffect(() => {
    setLocation(params.get("location") ?? "");
  }, [params]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => {
      router.push(`/tournaments${next.toString() ? `?${next.toString()}` : ""}`);
    });
  }

  // Debounce location typing — 400ms after last keystroke.
  useEffect(() => {
    const current = params.get("location") ?? "";
    if (location === current) return;
    const t = setTimeout(() => updateParam("location", location.trim()), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const status = params.get("status") ?? "";
  const type = params.get("type") ?? "";
  const gender = params.get("gender") ?? "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        label="Status"
        value={status}
        onChange={(v) => updateParam("status", v)}
        options={[
          { value: "", label: "Any status" },
          { value: "registration_open", label: "Open Registration" },
          { value: "registration_closed", label: "Registration Closed" },
          { value: "in_progress", label: "In Progress" },
          { value: "completed", label: "Completed" },
        ]}
      />
      <Select
        label="Type"
        value={type}
        onChange={(v) => updateParam("type", v)}
        options={[
          { value: "", label: "Singles or Doubles" },
          { value: "singles", label: "Singles" },
          { value: "doubles", label: "Doubles" },
        ]}
      />
      <Select
        label="Gender"
        value={gender}
        onChange={(v) => updateParam("gender", v)}
        options={[
          { value: "", label: "All divisions" },
          { value: "mens", label: "Men's" },
          { value: "womens", label: "Women's" },
          { value: "mixed", label: "Mixed" },
        ]}
      />
      <input
        type="search"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="City, state"
        className="input text-xs py-1.5 px-2.5 w-40"
        aria-label="Filter by location"
      />
      {(status || type || gender || location) && (
        <button
          type="button"
          onClick={() => {
            setLocation("");
            startTransition(() => router.push("/tournaments"));
          }}
          className="text-xs text-surface-muted hover:text-dark-100 underline"
        >
          Clear
        </button>
      )}
      {pending && <span className="text-[11px] text-surface-muted">Filtering…</span>}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input text-xs py-1.5 px-2 pr-7"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
