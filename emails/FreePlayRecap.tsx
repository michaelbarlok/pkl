import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  playerName?: string;
  groupName?: string;
  sessionDate?: string | null;
  wins?: number;
  losses?: number;
  gamesPlayed?: number;
  pointsWon?: number;
  pointsPossible?: number;
  pointDiff?: number;
  sessionId?: string;
  groupSlug?: string;
}

export default function FreePlayRecap({
  playerName,
  groupName,
  sessionDate,
  wins = 0,
  losses = 0,
  gamesPlayed = 0,
  pointsWon = 0,
  pointsPossible = 0,
  pointDiff = 0,
  sessionId,
  groupSlug,
}: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const pct = pointsPossible > 0 ? Math.round((pointsWon / pointsPossible) * 100) : 0;

  return (
    <BaseEmail
      preview={`Your ${groupName ?? "session"} recap is ready`}
      heading="Free Play Recap"
    >
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        Hi {playerName ?? "there"}, here&apos;s your recap for{" "}
        <strong>{groupName ?? "your session"}</strong>
        {sessionDate ? ` on ${sessionDate}` : ""}.
      </Text>

      <table width="100%" style={{ borderCollapse: "collapse", margin: "16px 0" }}>
        <tbody>
          <tr>
            <td style={labelCell}>Record</td>
            <td style={valueCell}>
              <span style={{ color: "#059669", fontWeight: 600 }}>{wins}W</span>
              {" – "}
              <span style={{ color: "#dc2626", fontWeight: 600 }}>{losses}L</span>
              <span style={{ color: "#6b7280", marginLeft: 8 }}>({gamesPlayed} games)</span>
            </td>
          </tr>
          <tr>
            <td style={labelCell}>Points</td>
            <td style={valueCell}>
              {pointsWon} / {pointsPossible}{" "}
              <span style={{ color: "#6b7280" }}>({pct}%)</span>
            </td>
          </tr>
          <tr>
            <td style={labelCell}>Pt Differential</td>
            <td style={{ ...valueCell, color: pointDiff > 0 ? "#059669" : pointDiff < 0 ? "#dc2626" : "#111827" }}>
              {pointDiff > 0 ? "+" : ""}{pointDiff}
            </td>
          </tr>
        </tbody>
      </table>

      <Text style={{ color: "#6b7280", fontSize: "13px", marginTop: "8px" }}>
        <Link
          href={sessionId && groupSlug ? `${appUrl}/groups/${groupSlug}/sessions/${sessionId}` : appUrl}
          style={{ color: "#14b8a6", textDecoration: "underline" }}
        >
          View full session results →
        </Link>
      </Text>
    </BaseEmail>
  );
}

const labelCell = {
  padding: "6px 12px 6px 0",
  fontSize: "13px",
  color: "#6b7280",
  whiteSpace: "nowrap" as const,
  verticalAlign: "top" as const,
  width: "140px",
};

const valueCell = {
  padding: "6px 0",
  fontSize: "14px",
  color: "#111827",
  fontWeight: "500" as const,
};
