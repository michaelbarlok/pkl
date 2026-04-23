// ============================================================
// Tournament Division Definitions
//
// Men's and Women's break down by age (All Ages / Senior 60+) AND
// skill (3.0 – 4.5+). Mixed is intentionally flat: one "All Ages"
// pool and one "Senior 60+" pool, no skill split — that's the
// organizer convention for this league.
//
// Division codes:
//   - Men's/Women's: `<gender>_<age>_<skill>` e.g. mens_senior_4.0
//   - Mixed:         `mixed_<age>`           e.g. mixed_all_ages
// Older rows may still carry `mixed_<age>_<skill>` from before this
// change; getDivisionLabel() falls through to a generic parser so
// they still render readable labels.
// ============================================================

export const GENDERS = [
  { value: "mens", label: "Men's" },
  { value: "womens", label: "Women's" },
  { value: "mixed", label: "Mixed" },
] as const;

export const AGES = [
  { value: "all_ages", label: "All Ages" },
  { value: "senior", label: "Senior (60+)" },
] as const;

export const SKILLS = [
  { value: "3.0", label: "3.0" },
  { value: "3.5", label: "3.5" },
  { value: "4.0", label: "4.0" },
  { value: "4.5+", label: "4.5+" },
] as const;

export interface Division {
  code: string;
  gender: string;
  age: string;
  skill: string | null;
  label: string;
}

function mkDivision(
  gender: (typeof GENDERS)[number],
  age: (typeof AGES)[number],
  skill: (typeof SKILLS)[number] | null
): Division {
  return {
    code: skill
      ? `${gender.value}_${age.value}_${skill.value}`
      : `${gender.value}_${age.value}`,
    gender: gender.value,
    age: age.value,
    skill: skill ? skill.value : null,
    label: skill
      ? `${gender.label} ${age.label} ${skill.label}`
      : `${gender.label} ${age.label}`,
  };
}

/**
 * Canonical division list.
 *   Men's × {All Ages, Senior} × {3.0, 3.5, 4.0, 4.5+}  = 8
 *   Women's × {All Ages, Senior} × {3.0, 3.5, 4.0, 4.5+} = 8
 *   Mixed × {All Ages, Senior}                          = 2
 *   Total: 18 divisions.
 */
export const ALL_DIVISIONS: Division[] = (() => {
  const list: Division[] = [];
  for (const gender of GENDERS) {
    if (gender.value === "mixed") {
      for (const age of AGES) list.push(mkDivision(gender, age, null));
    } else {
      for (const age of AGES) {
        for (const skill of SKILLS) list.push(mkDivision(gender, age, skill));
      }
    }
  }
  return list;
})();

/** All division codes */
export const ALL_DIVISION_CODES = ALL_DIVISIONS.map((d) => d.code);

/** Look up a division by code */
export function getDivision(code: string): Division | undefined {
  return ALL_DIVISIONS.find((d) => d.code === code);
}

/**
 * Return a friendly label for a division code. Falls back to a
 * generic parser for legacy codes (e.g. `mixed_all_ages_4.0` from
 * before Mixed was flattened) so older registrations still render.
 */
export function getDivisionLabel(code: string): string {
  const hit = getDivision(code);
  if (hit) return hit.label;

  // Generic fallback: <gender>_<age>[_<skill>]
  const parts = code.split("_");
  if (parts.length >= 2) {
    const gender = GENDERS.find((g) => g.value === parts[0])?.label ?? titleCase(parts[0]);
    // Age may be one or two tokens ("all_ages" or "senior").
    let age: string | undefined;
    let skill: string | undefined;
    if (parts[1] === "all" && parts[2] === "ages") {
      age = "All Ages";
      skill = parts.slice(3).join("_") || undefined;
    } else if (parts[1] === "senior") {
      age = "Senior (60+)";
      skill = parts.slice(2).join("_") || undefined;
    } else {
      age = titleCase(parts.slice(1).join(" "));
    }
    return [gender, age, skill].filter(Boolean).join(" ");
  }
  return code;
}

function titleCase(s: string): string {
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(" ");
}

/** Group divisions by gender for display */
export function groupDivisionsByGender(codes: string[]): Record<string, Division[]> {
  const divisions = codes.map(getDivision).filter(Boolean) as Division[];
  const grouped: Record<string, Division[]> = {};
  for (const d of divisions) {
    const genderLabel = GENDERS.find((g) => g.value === d.gender)?.label ?? d.gender;
    if (!grouped[genderLabel]) grouped[genderLabel] = [];
    grouped[genderLabel].push(d);
  }
  return grouped;
}
