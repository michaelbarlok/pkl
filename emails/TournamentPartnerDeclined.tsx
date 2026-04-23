import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  tournamentId?: string;
  tournamentTitle?: string;
  targetName?: string;
}

export default function TournamentPartnerDeclined({
  tournamentId = "",
  tournamentTitle = "this tournament",
  targetName = "Your partner",
}: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return (
    <BaseEmail
      preview={`${targetName} can't partner this time`}
      heading={`${targetName} declined your partner request`}
    >
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "22px" }}>
        <strong>{targetName}</strong> can&apos;t partner for{" "}
        <strong>{tournamentTitle}</strong>. No worries — register again with
        another partner or ask someone else on the Need-Partner list.
      </Text>
      <Text style={{ margin: "18px 0 0", fontSize: "13px" }}>
        <Link
          href={`${appUrl}/tournaments/${tournamentId}`}
          style={{ color: "#14b8a6", textDecoration: "underline" }}
        >
          Back to {tournamentTitle} →
        </Link>
      </Text>
    </BaseEmail>
  );
}
