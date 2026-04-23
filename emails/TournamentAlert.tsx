import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  /** The tournament name, e.g. "Spring Doubles Classic". */
  tournamentTitle?: string;
  /** Headline for the email, e.g. "Head to Court 3". */
  alertTitle?: string;
  /** Body copy. */
  alertBody?: string;
  /** Deep-link back into the app. */
  link?: string;
}

/**
 * Generic tournament live-play email. Used as the email fallback
 * for the mandatory notification types (court assigned, up-next,
 * in-3rd, division-started, playoffs-starting) when the viewer
 * doesn't have an active push subscription.
 */
export default function TournamentAlert({
  tournamentTitle,
  alertTitle = "Tournament update",
  alertBody = "",
  link,
}: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const href = link ? `${appUrl}${link}` : `${appUrl}/sessions/active`;
  return (
    <BaseEmail preview={alertTitle} heading={alertTitle}>
      {tournamentTitle && (
        <Text style={{ color: "#374151", fontSize: "13px", lineHeight: "18px", marginBottom: "4px" }}>
          From <strong>{tournamentTitle}</strong>
        </Text>
      )}
      <Text style={{ color: "#111827", fontSize: "15px", lineHeight: "22px", margin: "8px 0 16px" }}>
        {alertBody}
      </Text>
      <Text style={{ margin: "16px 0 0", fontSize: "13px" }}>
        <Link href={href} style={{ color: "#14b8a6", textDecoration: "underline" }}>
          Open the app →
        </Link>
      </Text>
    </BaseEmail>
  );
}
