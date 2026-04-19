/**
 * Derives a deterministic gradient from any seed string (a group slug,
 * name, id, whatever). Same input → same colors, so a group always wears
 * the same "brand" on every surface until admins upload a cover image.
 */

const PALETTE: Array<{ from: string; via?: string; to: string; label: string }> = [
  { from: "from-brand-600", via: "via-brand-500", to: "to-teal-600", label: "teal" },
  { from: "from-accent-500", via: "via-accent-600", to: "to-rose-600", label: "sunset" },
  { from: "from-indigo-600", via: "via-violet-600", to: "to-rose-500", label: "dusk" },
  { from: "from-emerald-600", via: "via-teal-600", to: "to-sky-600", label: "forest" },
  { from: "from-sky-600", via: "via-indigo-600", to: "to-violet-600", label: "horizon" },
  { from: "from-rose-500", via: "via-accent-500", to: "to-amber-500", label: "ember" },
  { from: "from-violet-600", via: "via-brand-500", to: "to-emerald-500", label: "prism" },
  { from: "from-slate-700", via: "via-brand-600", to: "to-teal-500", label: "abyss" },
];

function hashIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

export function groupGradient(seed: string): string {
  const p = PALETTE[hashIndex(seed || "default", PALETTE.length)];
  return `bg-gradient-to-br ${p.from} ${p.via ?? ""} ${p.to}`.trim();
}
