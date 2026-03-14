"use client";

import { useState, useRef, useCallback } from "react";

interface Member {
  id: string;
  display_name: string;
}

interface MentionTextareaProps {
  value: string;
  onChange: (val: string) => void;
  members: Member[];
  maxLength: number;
  minHeight: string;
  placeholder?: string;
  required?: boolean;
}

/**
 * Textarea with @mention autocomplete.
 * Type @ followed by letters to search group members by name (starts-with matching).
 * Click a suggestion to insert the full @Display Name into the text.
 */
export function MentionTextarea({
  value,
  onChange,
  members,
  maxLength,
  minHeight,
  placeholder,
  required = true,
}: MentionTextareaProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Member[]>([]);
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      const pos = e.target.selectionStart;
      const textBeforeCursor = newValue.slice(0, pos);

      // Find the last @ before cursor that could be a mention trigger
      const atIndex = textBeforeCursor.lastIndexOf("@");

      if (atIndex >= 0) {
        // @ must be at start of text, or preceded by whitespace
        const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : " ";
        if (charBefore === " " || charBefore === "\n" || atIndex === 0) {
          const query = textBeforeCursor.slice(atIndex + 1);

          // Don't show suggestions if query contains newline (user moved to next line)
          if (!query.includes("\n")) {
            const lowerQuery = query.toLowerCase();
            const filtered = members.filter((m) => {
              const name = m.display_name.toLowerCase();
              // Match if any part of the name starts with the query,
              // or if the full name starts with the query
              return (
                name.startsWith(lowerQuery) ||
                name.split(" ").some((part) => part.startsWith(lowerQuery))
              );
            });

            setSuggestions(filtered.slice(0, 5));
            setShowSuggestions(filtered.length > 0);
            setMentionStart(atIndex);
            return;
          }
        }
      }

      setShowSuggestions(false);
    },
    [members, onChange]
  );

  function selectMember(member: Member) {
    // Get current cursor position from the textarea ref
    const cursorPos = textareaRef.current?.selectionStart ?? value.length;

    // Replace everything from @... up to cursor with @Display Name
    const before = value.slice(0, mentionStart);
    const after = value.slice(cursorPos);
    const spacer =
      after.startsWith(" ") || after.startsWith("\n") || after === ""
        ? ""
        : " ";
    const newValue = `${before}@${member.display_name}${spacer}${after}`;
    onChange(newValue);
    setShowSuggestions(false);

    // Refocus the textarea and place cursor after the inserted mention
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newCursorPos =
          mentionStart + 1 + member.display_name.length + (spacer ? 1 : 0);
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        className="input"
        style={{ minHeight }}
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
      />
      {showSuggestions && (
        <div className="absolute z-20 bottom-full mb-1 w-64 max-h-48 overflow-y-auto rounded-lg border border-surface-border bg-surface-raised shadow-lg">
          {suggestions.map((member) => (
            <button
              key={member.id}
              type="button"
              onMouseDown={(e) => {
                // Use mousedown + preventDefault so the textarea doesn't lose focus
                e.preventDefault();
                selectMember(member);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-dark-200 hover:bg-surface-overlay"
            >
              @{member.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
