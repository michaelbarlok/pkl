/**
 * Deterministic gradient keyed on the tournament id so each
 * tournament wears a consistent "color" across the app — the detail
 * page hero, the Play tab "Your Court" card, future badge treatments.
 * Stays inside the brand palette.
 */
export function tournamentHeroGradient(seed: string): string {
  const palette = [
    "from-brand-700/50 via-brand-600/30 to-surface-raised",
    "from-accent-700/40 via-brand-600/25 to-surface-raised",
    "from-teal-700/40 via-brand-600/25 to-surface-raised",
    "from-indigo-700/40 via-violet-600/25 to-surface-raised",
    "from-rose-700/35 via-accent-600/25 to-surface-raised",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}
