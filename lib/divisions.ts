// ============================================================
// Tournament Division Definitions
// A division is a permutation of Gender × Age × Skill Level
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

/** All 24 possible division permutations */
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

/** Get a human-readable label for a division code */
export function getDivisionLabel(code: string): string {
  return getDivision(code)?.label ?? code;
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
