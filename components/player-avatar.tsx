import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  displayName: string;
  avatarUrl: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-7 w-7 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-10 w-10 text-base",
};

export function PlayerAvatar({ displayName, avatarUrl, size = "md", className }: PlayerAvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={cn("rounded-full object-cover shrink-0", sizeClasses[size], className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-brand-900/50 text-brand-300 font-medium shrink-0",
        sizeClasses[size],
        className
      )}
    >
      {displayName.charAt(0).toUpperCase()}
    </div>
  );
}
