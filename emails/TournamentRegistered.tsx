import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  tournamentTitle?: string;
  tournamentId?: string;
  status?: "confirmed" | "waitlist";
  waitlistPosition?: number;
  divisionLabel?: string;
  partnerName?: string;
}

export default function TournamentRegistered({
  tournamentTitle,
  tournamentId,
  status = "confirmed",
  waitlistPosition,
  divisionLabel,
  partnerName,
}: Props) {
  const isWaitlist = status === "waitlist";

  return (
    <BaseEmail
      preview={isWaitlist ? `You're on the waitlist for ${tournamentTitle}` : `You're registered for ${tournamentTitle}`}
      heading={isWaitlist ? "You're on the Waitlist" : "Registration Confirmed!"}
    >
      {isWaitlist ? (
        <>
          <Text style={text}>
            You've been added to the waitlist for{" "}
            <strong>{tournamentTitle ?? "the tournament"}</strong>
            {waitlistPosition ? ` at position #${waitlistPosition}` : ""}
            {partnerName ? `, teaming up with ${partnerName}` : ""}.
          </Text>
          <Text style={text}>
            We'll notify you right away if a spot opens up. No action is needed in the meantime.
          </Text>
        </>
      ) : (
        <>
          <Text style={text}>
            You're confirmed for <strong>{tournamentTitle ?? "the tournament"}</strong>
            {divisionLabel ? ` in the ${divisionLabel} division` : ""}.
            {partnerName ? ` You'll be playing with ${partnerName}.` : ""}
          </Text>
          <Text style={text}>
            See you on the court! Check the tournament page for schedule updates and bracket info as the event approaches.
          </Text>
        </>
      )}
      <Button
        href={tournamentId ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/tournaments/${tournamentId}` : "#"}
        style={button}
      >
        View Tournament
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
