import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  tournamentId?: string;
  tournamentTitle?: string;
  requesterName?: string;
}

export default function TournamentPartnerRequest({
  tournamentId = "",
  tournamentTitle = "this tournament",
  requesterName = "Someone",
}: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return (
    <BaseEmail
      preview={`${requesterName} wants to be your partner`}
      heading={`${requesterName} wants to partner up`}
    >
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "22px" }}>
        You posted &quot;Need Partner&quot; on <strong>{tournamentTitle}</strong>, and{" "}
        <strong>{requesterName}</strong> wants to be your partner. Open the
        tournament and confirm or decline.
      </Text>
      <Text style={{ margin: "18px 0 0", fontSize: "13px" }}>
        <Link
          href={`${appUrl}/tournaments/${tournamentId}`}
          style={{ color: "#14b8a6", textDecoration: "underline" }}
        >
          Open {tournamentTitle} →
        </Link>
      </Text>
    </BaseEmail>
  );
}
