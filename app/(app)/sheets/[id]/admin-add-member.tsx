"use client";

import { FormError } from "@/components/form-error";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Member {
  id: string;
  display_name: string;
}

export function AdminAddMember({
  sheetId,
  members,
}: {
  sheetId: string;
  members: Member[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredMembers = members.filter(
    (m) =>
      !selectedIds.includes(m.id) &&
      m.display_name.toLowerCase().includes(search.toLowerCase())
  );

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev; // Max 5
      return [...prev, id];
    });
  }

  function removeMember(id: string) {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  async function handleAdd() {
    if (selectedIds.length === 0) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    const names: string[] = [];
    const errors: string[] = [];

    for (const playerId of selectedIds) {
      try {
        const res = await fetch(`/api/sheets/${sheetId}/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ player_id: playerId }),
        });
        const data = await res.json();
        if (!res.ok) {
          const member = members.find((m) => m.id === playerId);
          errors.push(`${member?.display_name ?? "Unknown"}: ${data.error}`);
        } else {
          const member = members.find((m) => m.id === playerId);
          names.push(member?.display_name ?? "Unknown");
        }
      } catch {
        const member = members.find((m) => m.id === playerId);
        errors.push(`${member?.display_name ?? "Unknown"}: Network error`);
      }
    }

    if (names.length > 0) {
      setSuccess(`Added ${names.join(", ")}.`);
    }
    if (errors.length > 0) {
      setError(errors.join("; "));
    }

    setSelectedIds([]);
    setSearch("");
    setLoading(false);
    router.refresh();
  }

  const selectedMembers = selectedIds
    .map((id) => members.find((m) => m.id === id))
    .filter(Boolean) as Member[];

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-dark-100 mb-3">
        Add Members
      </h3>
      {error && (
        <div className="mb-3">
          <FormError message={error} />
        </div>
      )}
      {success && (
        <div className="mb-3 rounded-md bg-teal-900/30 p-2 text-sm text-teal-300">
          {success}
        </div>
      )}

      <div className="flex gap-2 items-start">
        {/* Multi-select dropdown */}
        <div className="relative flex-1" ref={dropdownRef}>
          {/* Selected chips + search input */}
          <div
            className="input flex flex-wrap gap-1.5 min-h-[2.5rem] cursor-text py-1.5 px-2"
            onClick={() => {
              setDropdownOpen(true);
              inputRef.current?.focus();
            }}
          >
            {selectedMembers.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 rounded-full bg-brand-900/50 text-brand-300 text-xs font-medium px-2 py-0.5"
              >
                {m.display_name}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeMember(m.id);
                  }}
                  className="hover:text-brand-100"
                >
                  &times;
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setDropdownOpen(true);
              }}
              onFocus={() => setDropdownOpen(true)}
              placeholder={selectedIds.length === 0 ? "Search members..." : selectedIds.length >= 5 ? "Max 5 selected" : "Search..."}
              disabled={selectedIds.length >= 5}
              className="flex-1 min-w-[8rem] bg-transparent border-none outline-none text-sm text-dark-100 placeholder:text-surface-muted"
            />
          </div>

          {/* Dropdown list */}
          {dropdownOpen && filteredMembers.length > 0 && (
            <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-surface-border bg-surface-raised shadow-lg">
              {filteredMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    toggleMember(m.id);
                    setSearch("");
                    inputRef.current?.focus();
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-dark-100 hover:bg-surface-overlay transition-colors"
                >
                  {m.display_name}
                </button>
              ))}
            </div>
          )}
          {dropdownOpen && filteredMembers.length === 0 && search && (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-surface-border bg-surface-raised shadow-lg px-3 py-2 text-sm text-surface-muted">
              No members found
            </div>
          )}
        </div>

        <button
          onClick={handleAdd}
          disabled={selectedIds.length === 0 || loading}
          className="btn-primary whitespace-nowrap"
        >
          {loading
            ? "Adding..."
            : `Add${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`}
        </button>
      </div>
      {selectedIds.length > 0 && (
        <p className="mt-1.5 text-xs text-surface-muted">
          {selectedIds.length}/5 selected
        </p>
      )}
    </div>
  );
}
