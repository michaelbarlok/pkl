"use client";

import { GENDERS, AGES, SKILLS, ALL_DIVISIONS, ALL_DIVISION_CODES } from "@/lib/divisions";

interface Props {
  selected: string[];
  onChange: (codes: string[]) => void;
}

export function DivisionCheckboxes({ selected, onChange }: Props) {
  const allChecked = ALL_DIVISION_CODES.every((c) => selected.includes(c));

  function toggleAll() {
    onChange(allChecked ? [] : [...ALL_DIVISION_CODES]);
  }

  function toggle(code: string) {
    if (selected.includes(code)) {
      onChange(selected.filter((c) => c !== code));
    } else {
      onChange([...selected, code]);
    }
  }

  return (
    <div className="space-y-3">
      {/* Select All */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={toggleAll}
          className="rounded border-surface-border text-brand-500 focus:ring-brand-500"
        />
        <span className="text-sm font-semibold text-dark-100">Select All</span>
      </label>

      <div className="border-t border-surface-border" />

      {/* Grid: one column per gender */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {GENDERS.map((gender) => (
          <div key={gender.value}>
            <h4 className="text-xs font-semibold text-dark-200 uppercase tracking-wider mb-2">
              {gender.label}
            </h4>
            <div className="space-y-1.5">
              {AGES.map((age) =>
                SKILLS.map((skill) => {
                  const code = `${gender.value}_${age.value}_${skill.value}`;
                  const checked = selected.includes(code);
                  return (
                    <label
                      key={code}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(code)}
                        className="rounded border-surface-border text-brand-500 focus:ring-brand-500"
                      />
                      <span className="text-sm text-dark-200">
                        {age.label} {skill.label}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
