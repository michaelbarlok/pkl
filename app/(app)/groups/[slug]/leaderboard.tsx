import { cn } from "@/lib/utils";

interface PlayerStat {
  player_id: string;
  points_won: number;
  points_possible: number;
  games_played: number;
  pct: number;
  player: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export function FreePlayLeaderboard({
  stats,
  currentPlayerId,
}: {
  stats: PlayerStat[];
  currentPlayerId?: string;
}) {
  if (stats.length === 0) {
    return (
      <div className="card py-8 text-center text-sm text-surface-muted">
        No matches played yet.
      </div>
    );
  }

  return (
    <>
      {/* Mobile: card list */}
      <div className="space-y-2 sm:hidden">
        {stats.map((stat, index) => (
          <div
            key={stat.player_id}
            className={cn(
              "card flex items-center gap-3",
              stat.player_id === currentPlayerId && "ring-2 ring-brand-500/40"
            )}
          >
            <span className="text-sm font-medium text-surface-muted w-5 text-center shrink-0">
              {index + 1}
            </span>
            {stat.player?.avatar_url ? (
              <img
                src={stat.player.avatar_url}
                alt=""
                className="h-8 w-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted shrink-0">
                {stat.player?.display_name?.charAt(0) ?? "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-dark-100 truncate">
                {stat.player?.display_name}
              </p>
              <p className="text-xs text-surface-muted">
                {stat.games_played} games &middot; {stat.points_won}/{stat.points_possible} pts
              </p>
            </div>
            <span className="text-sm font-semibold text-brand-400 shrink-0">
              {stat.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="card overflow-hidden p-0 hidden sm:block">
        <table className="min-w-full divide-y divide-surface-border">
          <thead className="bg-surface-overlay">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                #
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                Player
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                Pts Won %
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                Games
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                Pts Won
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                Pts Possible
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border bg-surface-raised">
            {stats.map((stat, index) => (
              <tr
                key={stat.player_id}
                className={cn(
                  stat.player_id === currentPlayerId && "bg-brand-900/40"
                )}
              >
                <td className="whitespace-nowrap px-4 py-3 text-sm text-surface-muted">
                  {index + 1}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-3">
                    {stat.player?.avatar_url ? (
                      <img
                        src={stat.player.avatar_url}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted">
                        {stat.player?.display_name?.charAt(0) ?? "?"}
                      </div>
                    )}
                    <span className="text-sm font-medium text-dark-100">
                      {stat.player?.display_name}
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-brand-400">
                  {stat.pct.toFixed(1)}%
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-dark-100">
                  {stat.games_played}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-dark-100">
                  {stat.points_won}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-surface-muted">
                  {stat.points_possible}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
