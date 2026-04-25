// ============================================================
// Tournament Division Definitions
// A division is a permutation of Gender × Age × Skill Level.
// Codes follow `<gender>_<age>_<skill>`, e.g. mens_senior_4.0.
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
  skill: string;
  label: string;
}

/** All 24 possible division permutations (3 genders × 2 ages × 4 skills). */
export const ALL_DIVISIONS: Division[] = GENDERS.flatMap((g) =>
  AGES.flatMap((a) =>
    SKILLS.map((s) => ({
      code: `${g.value}_${a.value}_${s.value}`,
      gender: g.value,
      age: a.value,
      skill: s.value,
      label: `${g.label} ${a.label} ${s.label}`,
    }))
  )
);

/** All division codes */
export const ALL_DIVISION_CODES = ALL_DIVISIONS.map((d) => d.code);

/** Look up a division by code */
export function getDivision(code: string): Division | undefined {
  return ALL_DIVISIONS.find((d) => d.code === code);
}

/**
 * Pull the gender bucket out of a division code. Used by the
 * registration route to enforce "one gendered division max +
 * optional mixed" — a player can sign up for Men's + Mixed or
 * Women's + Mixed, but never Men's + Women's.
 */
export function getDivisionGender(
  code: string
): "mens" | "womens" | "mixed" | null {
  const div = getDivision(code);
  if (div) return div.gender as "mens" | "womens" | "mixed";
  // Legacy code path — older codes may not match ALL_DIVISIONS but
  // still encode the gender as the first underscore-delimited token.
  const first = code.split("_")[0];
  if (first === "mens" || first === "womens" || first === "mixed") return first;
  return null;
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
