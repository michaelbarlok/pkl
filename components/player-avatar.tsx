import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

interface PlayerAvatarProps {
  displayName: string;
  avatarUrl: string | null;
  size?: Size;
  className?: string;
}

const sizeClasses: Record<Size, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-7 w-7 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-10 w-10 text-base",
  xl: "h-14 w-14 text-lg",
  "2xl": "h-20 w-20 text-2xl",
};

/** Eight gentle gradients keyed off a hash of the name, so the same person
 *  always gets the same chip color wherever they appear. Chosen to look
 *  decent on both dark and light surfaces. */
const PALETTE = [
  "from-brand-500 to-brand-700",
  "from-teal-500 to-teal-700",
  "from-accent-500 to-accent-700",
  "from-indigo-500 to-indigo-700",
  "from-rose-500 to-rose-700",
  "from-emerald-500 to-emerald-700",
  "from-violet-500 to-violet-700",
  "from-sky-500 to-sky-700",
];

function hashIndex(name: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

/** "Alex Morgan" -> "AM", "jordan" -> "J". Strips punctuation and prefixes
 *  like "[TEST]" so the fallback chip reads cleanly. */
function initialsOf(name: string): string {
  const cleaned = name.replace(/\[[^\]]+\]\s*/g, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function PlayerAvatar({ displayName, avatarUrl, size = "md", className }: PlayerAvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={cn("rounded-full object-cover shrink-0 ring-1 ring-surface-border/60", sizeClasses[size], className)}
      />
    );
  }
  const gradient = PALETTE[hashIndex(displayName, PALETTE.length)];
  return (
    <div
      aria-label={displayName}
      className={cn(
        "flex items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white shrink-0 ring-1 ring-white/10",
        gradient,
        sizeClasses[size],
        className
      )}
    >
      {initialsOf(displayName)}
    </div>
  );
}
