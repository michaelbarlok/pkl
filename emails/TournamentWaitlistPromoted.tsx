import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  tournamentTitle?: string;
  tournamentId?: string;
}

export default function TournamentWaitlistPromoted({ tournamentTitle, tournamentId }: Props) {
  return (
    <BaseEmail preview="You're in!" heading="You've been promoted from the waitlist!">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        A spot opened up and you&apos;ve been moved from the waitlist to the confirmed roster for{" "}
        <strong>{tournamentTitle ?? "the tournament"}</strong>.
      </Text>
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        Your registration is now confirmed. No further action is needed.
      </Text>
      <Button
        href={tournamentId ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/tournaments/${tournamentId}` : "#"}
        style={{
          backgroundColor: "#14b8a6",
          borderRadius: "6px",
          color: "#ffffff",
          fontSize: "14px",
          fontWeight: "600",
          padding: "12px 24px",
          textDecoration: "none",
          display: "inline-block",
          marginTop: "16px",
        }}
      >
        View Tournament
      </Button>
    </BaseEmail>
  );
}
