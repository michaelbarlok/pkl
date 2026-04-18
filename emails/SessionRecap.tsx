import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  playerName?: string;
  groupName?: string;
  eventDate?: string | null;
  courtNumber?: number | null;
  finish?: number | null;
  wins?: number;
  losses?: number;
  stepBefore?: number | null;
  stepAfter?: number | null;
  targetCourtNext?: number | null;
  isCourtPromotion?: boolean;
  sessionId?: string;
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export default function SessionRecap({
  playerName,
  groupName,
  eventDate,
  courtNumber,
  finish,
  wins = 0,
  losses = 0,
  stepBefore,
  stepAfter,
  targetCourtNext,
  isCourtPromotion,
  sessionId,
}: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const stepChanged = stepBefore != null && stepAfter != null && stepAfter !== stepBefore;
  const stepUp = stepChanged && stepAfter! < stepBefore!;

  return (
    <BaseEmail
      preview={`Your ${groupName ?? "session"} recap is ready`}
      heading="Session Recap"
    >
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        Hi {playerName ?? "there"}, here&apos;s your recap for{" "}
        <strong>{groupName ?? "your session"}</strong>
        {eventDate ? ` on ${eventDate}` : ""}.
      </Text>

      {/* Stats grid */}
      <table width="100%" style={{ borderCollapse: "collapse", margin: "16px 0" }}>
        <tbody>
          {finish != null && courtNumber != null && (
            <tr>
              <td style={labelCell}>Finish</td>
              <td style={valueCell}>
                {ordinal(finish)} place — Court {courtNumber}
              </td>
            </tr>
          )}
          <tr>
            <td style={labelCell}>Record</td>
            <td style={valueCell}>
              <span style={{ color: "#059669", fontWeight: 600 }}>{wins}W</span>
              {" – "}
              <span style={{ color: "#dc2626", fontWeight: 600 }}>{losses}L</span>
            </td>
          </tr>
          {stepBefore != null && stepAfter != null && (
            <tr>
              <td style={labelCell}>Step</td>
              <td style={valueCell}>
                {stepBefore} → {stepAfter}
                {stepChanged && (
                  <span style={{ marginLeft: 6, color: stepUp ? "#059669" : "#dc2626", fontWeight: 600 }}>
                    {stepUp ? "↑" : "↓"}
                  </span>
                )}
              </td>
            </tr>
          )}
          {isCourtPromotion && targetCourtNext != null && courtNumber != null && (
            <tr>
              <td style={labelCell}>Next Session</td>
              <td style={valueCell}>
                Court {targetCourtNext}
                {targetCourtNext < courtNumber && (
                  <span style={{ marginLeft: 6, color: "#059669", fontWeight: 600 }}>↑ Moving up</span>
                )}
                {targetCourtNext > courtNumber && (
                  <span style={{ marginLeft: 6, color: "#dc2626", fontWeight: 600 }}>↓ Moving down</span>
                )}
                {targetCourtNext === courtNumber && (
                  <span style={{ marginLeft: 6, color: "#6b7280" }}>→ Staying</span>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <Text style={{ color: "#6b7280", fontSize: "13px", marginTop: "8px" }}>
        <Link
          href={sessionId ? `${appUrl}/sessions/${sessionId}` : appUrl}
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
  width: "120px",
};

const valueCell = {
  padding: "6px 0",
  fontSize: "14px",
  color: "#111827",
  fontWeight: "500" as const,
};
