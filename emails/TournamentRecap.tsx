import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

type Standing = {
  playerId: string;
  displayName: string;
  partnerName: string | null;
  wins: number;
  losses: number;
  pointDiff: number;
};

type Placement = {
  place: number;
  displayName: string;
  partnerName: string | null;
};

type DivisionSummary = {
  division: string;
  label: string;
  poolStandings: Standing[];
  playoffPlacements: Placement[];
};

interface Props {
  tournamentId?: string;
  tournamentTitle?: string;
  viewerRole?: "player" | "organizer";
  myDivision?: string | null;
  divisions?: DivisionSummary[];
}

/**
 * End-of-tournament recap email. Two audience modes:
 *   - Players (viewerRole="player"): their own division rendered in
 *     full at the top, followed by a compact "top finishers" block
 *     for every other division.
 *   - Organizers (viewerRole="organizer"): every division rendered in
 *     full (pool standings + playoff placements).
 */
export default function TournamentRecap({
  tournamentId = "",
  tournamentTitle = "Tournament Recap",
  viewerRole = "player",
  myDivision = null,
  divisions = [],
}: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const isOrganizer = viewerRole === "organizer";

  const myDivisionRecap =
    myDivision && !isOrganizer
      ? divisions.find((d) => d.division === myDivision) ?? null
      : null;
  const otherDivisions = divisions.filter(
    (d) => !myDivisionRecap || d.division !== myDivisionRecap.division
  );

  return (
    <BaseEmail
      preview={`${tournamentTitle} — final results`}
      heading={`${tournamentTitle}: final results`}
    >
      <Text style={lead}>
        {isOrganizer
          ? "Here are the final standings for every division."
          : "Nice playing. Here's where you finished and a snapshot of the other divisions."}
      </Text>

      {myDivisionRecap && (
        <>
          <Text style={sectionHeading}>
            Your division — {myDivisionRecap.label}
          </Text>
          <FullDivisionBlock division={myDivisionRecap} />
        </>
      )}

      {isOrganizer ? (
        <>
          {divisions.map((d) => (
            <div key={d.division}>
              <Text style={sectionHeading}>{d.label}</Text>
              <FullDivisionBlock division={d} />
            </div>
          ))}
        </>
      ) : (
        <>
          {otherDivisions.length > 0 && (
            <Text style={sectionHeading}>Top finishers — other divisions</Text>
          )}
          {otherDivisions.map((d) => (
            <div key={d.division} style={compactDivision}>
              <Text style={compactDivLabel}>{d.label}</Text>
              <TopFinishersList placements={d.playoffPlacements} fallback={d.poolStandings} />
            </div>
          ))}
        </>
      )}

      <Text style={{ color: "#6b7280", fontSize: "13px", marginTop: "20px" }}>
        <Link
          href={`${appUrl}/tournaments/${tournamentId}`}
          style={{ color: "#14b8a6", textDecoration: "underline" }}
        >
          View the tournament →
        </Link>
      </Text>
    </BaseEmail>
  );
}

function FullDivisionBlock({ division }: { division: DivisionSummary }) {
  return (
    <>
      {division.playoffPlacements.length > 0 && (
        <div style={placementsWrap}>
          {division.playoffPlacements.map((p) => (
            <Text key={p.place} style={placementLine}>
              <span style={placementNumber}>{medal(p.place)}</span>{" "}
              <strong>
                {p.displayName}
                {p.partnerName ? ` & ${p.partnerName}` : ""}
              </strong>
            </Text>
          ))}
        </div>
      )}

      {division.poolStandings.length > 0 && (
        <table style={table}>
          <thead>
            <tr>
              <th style={thLeft}>#</th>
              <th style={thLeft}>Team</th>
              <th style={thRight}>W</th>
              <th style={thRight}>L</th>
              <th style={thRight}>+/-</th>
            </tr>
          </thead>
          <tbody>
            {division.poolStandings.map((s, idx) => (
              <tr key={s.playerId}>
                <td style={td}>{idx + 1}</td>
                <td style={td}>
                  {s.displayName}
                  {s.partnerName ? ` & ${s.partnerName}` : ""}
                </td>
                <td style={tdRight}>{s.wins}</td>
                <td style={tdRight}>{s.losses}</td>
                <td style={tdRight}>
                  {s.pointDiff > 0 ? `+${s.pointDiff}` : s.pointDiff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function TopFinishersList({
  placements,
  fallback,
}: {
  placements: Placement[];
  fallback: Standing[];
}) {
  if (placements.length > 0) {
    return (
      <ul style={ul}>
        {placements.map((p) => (
          <li key={p.place} style={li}>
            {medal(p.place)}{" "}
            <strong>
              {p.displayName}
              {p.partnerName ? ` & ${p.partnerName}` : ""}
            </strong>
          </li>
        ))}
      </ul>
    );
  }
  // Playoff never happened — derive top finishers from pool standings.
  const top = fallback.slice(0, 3);
  return (
    <ul style={ul}>
      {top.map((s, idx) => (
        <li key={s.playerId} style={li}>
          {medal(idx + 1)}{" "}
          <strong>
            {s.displayName}
            {s.partnerName ? ` & ${s.partnerName}` : ""}
          </strong>{" "}
          <span style={mutedInline}>
            ({s.wins}–{s.losses}, {s.pointDiff > 0 ? "+" : ""}
            {s.pointDiff})
          </span>
        </li>
      ))}
    </ul>
  );
}

function medal(place: number): string {
  if (place === 1) return "🥇";
  if (place === 2) return "🥈";
  if (place === 3) return "🥉";
  return `${place}.`;
}

const lead = { color: "#374151", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const sectionHeading = {
  color: "#111827",
  fontSize: "14px",
  fontWeight: 600 as const,
  margin: "18px 0 8px",
  paddingBottom: "4px",
  borderBottom: "1px solid #e5e7eb",
};
const placementsWrap = { margin: "0 0 12px" };
const placementLine = {
  margin: "2px 0",
  color: "#111827",
  fontSize: "13px",
  lineHeight: "20px",
};
const placementNumber = { fontSize: "16px" };
const table = {
  borderCollapse: "collapse" as const,
  width: "100%",
  fontSize: "13px",
  margin: "0 0 12px",
};
const thLeft = {
  textAlign: "left" as const,
  padding: "6px 8px",
  borderBottom: "1px solid #e5e7eb",
  color: "#6b7280",
  fontSize: "11px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
};
const thRight = { ...thLeft, textAlign: "right" as const };
const td = {
  padding: "6px 8px",
  borderBottom: "1px solid #f3f4f6",
  color: "#111827",
};
const tdRight = { ...td, textAlign: "right" as const };
const compactDivision = { margin: "0 0 12px" };
const compactDivLabel = {
  color: "#111827",
  fontWeight: 600 as const,
  fontSize: "13px",
  margin: "0 0 4px",
};
const ul = { margin: "0 0 10px", paddingLeft: "18px" };
const li = { color: "#111827", fontSize: "13px", lineHeight: "20px", margin: "2px 0" };
const mutedInline = { color: "#6b7280" };
