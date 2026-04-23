"use client";

import { ALL_DIVISIONS, ALL_DIVISION_CODES, GENDERS, AGES } from "@/lib/divisions";

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

      {/* Grid: one column per gender. Men's/Women's group by age then
          list skills; Mixed is flat (one checkbox per age). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {GENDERS.map((gender) => {
          const genderDivs = ALL_DIVISIONS.filter((d) => d.gender === gender.value);
          return (
            <div key={gender.value}>
              <h4 className="text-xs font-semibold text-dark-200 uppercase tracking-wider mb-2">
                {gender.label}
              </h4>
              <div className="space-y-3">
                {AGES.map((age) => {
                  const ageDivs = genderDivs.filter((d) => d.age === age.value);
                  if (ageDivs.length === 0) return null;
                  return (
                    <div key={age.value}>
                      <p className="text-[11px] text-surface-muted mb-1">{age.label}</p>
                      <div className="space-y-1.5">
                        {ageDivs.map((d) => {
                          const checked = selected.includes(d.code);
                          return (
                            <label
                              key={d.code}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggle(d.code)}
                                className="rounded border-surface-border text-brand-500 focus:ring-brand-500"
                              />
                              <span className="text-sm text-dark-200">{d.skill}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
