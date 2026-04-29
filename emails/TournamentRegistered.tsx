import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  tournamentTitle?: string;
  tournamentId?: string;
  status?: "confirmed" | "waitlist";
  waitlistPosition?: number;
  divisionLabel?: string;
  partnerName?: string;
  /** True when the recipient was added as a partner by someone else
   *  (vs. registering themselves). The email leans on this to make
   *  it obvious they can decline if it wasn't expected. */
  addedAsPartner?: boolean;
}

export default function TournamentRegistered({
  tournamentTitle,
  tournamentId,
  status = "confirmed",
  waitlistPosition,
  divisionLabel,
  partnerName,
  addedAsPartner,
}: Props) {
  const isWaitlist = status === "waitlist";
  const tournamentUrl = tournamentId
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/tournaments/${tournamentId}`
    : "#";

  // Recipient-was-added-as-partner branch. Auto-confirmed (or
  // auto-waitlisted), but with a clear "this happened, you didn't
  // do it, you can back out" framing. The CTA points at the
  // tournament page where the Decline Partnership button lives.
  if (addedAsPartner) {
    return (
      <BaseEmail
        preview={
          partnerName
            ? `${partnerName} added you as their partner for ${tournamentTitle}`
            : `You were added as a partner for ${tournamentTitle}`
        }
        heading={partnerName ? `${partnerName} added you as their partner` : "You were added as a partner"}
      >
        <Text style={text}>
          {partnerName ? <strong>{partnerName}</strong> : "Someone"} signed up for{" "}
          <strong>{tournamentTitle ?? "the tournament"}</strong>
          {divisionLabel ? ` in the ${divisionLabel} division` : ""}{" "}
          and listed you as their partner.
          {isWaitlist ? " The team is on the waitlist." : " You're confirmed as their partner."}
        </Text>
        <Text style={text}>
          If this is news to you, or you can&apos;t play, you can decline on
          the tournament page below — the original registrant will stay on
          the list as a Need-Partner registrant.
        </Text>
        <Button href={tournamentUrl} style={button}>
          View Tournament
        </Button>
      </BaseEmail>
    );
  }

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
      <Button href={tournamentUrl} style={button}>
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
