import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  tournamentId?: string;
  tournamentTitle?: string;
  targetName?: string;
}

export default function TournamentPartnerAccepted({
  tournamentId = "",
  tournamentTitle = "this tournament",
  targetName = "Your partner",
}: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return (
    <BaseEmail
      preview={`${targetName} is your partner`}
      heading={`${targetName} is your partner`}
    >
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "22px" }}>
        <strong>{targetName}</strong> accepted your partner request. You&apos;re
        locked in for <strong>{tournamentTitle}</strong>.
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
