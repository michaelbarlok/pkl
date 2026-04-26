import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  tournamentTitle?: string;
  tournamentId?: string;
  /** True when the recipient is the partner of the player who hit
   *  Withdraw. Their team just dissolved out from under them, so the
   *  copy needs to make it explicit that they're no longer registered
   *  and have to re-register if they still want to play. */
  partnerWithdrew?: boolean;
}

export default function TournamentWithdrawal({ tournamentTitle, tournamentId, partnerWithdrew }: Props) {
  const heading = partnerWithdrew ? "Your partner withdrew" : "Withdrawal Confirmed";
  const preview = partnerWithdrew
    ? `Your partner withdrew from ${tournamentTitle ?? "the tournament"}`
    : `Withdrawal confirmed — ${tournamentTitle}`;
  return (
    <BaseEmail preview={preview} heading={heading}>
      {partnerWithdrew ? (
        <>
          <Text style={text}>
            Your partner withdrew from{" "}
            <strong>{tournamentTitle ?? "the tournament"}</strong>, so your team has been removed.
          </Text>
          <Text style={text}>
            If you&rsquo;d still like to play, head back to the tournament page and register again with another partner while registration is open.
          </Text>
        </>
      ) : (
        <>
          <Text style={text}>
            You have been withdrawn from{" "}
            <strong>{tournamentTitle ?? "the tournament"}</strong>. Your spot has been released.
          </Text>
          <Text style={text}>
            If this was a mistake or you&rsquo;d like to re-register, visit the tournament page while registration is still open.
          </Text>
        </>
      )}
      <Button
        href={tournamentId ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/tournaments/${tournamentId}` : "#"}
        style={button}
      >
        {partnerWithdrew ? "Register Again" : "View Tournament"}
      </Button>
    </BaseEmail>
  );
}

const text = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const button = {
  backgroundColor: "#14b8a6",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600" as const,
  padding: "12px 24px",
  textDecoration: "none",
  display: "inline-block",
  marginTop: "16px",
};
