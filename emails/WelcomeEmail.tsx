import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  displayName?: string;
}

export default function WelcomeEmail({ displayName }: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return (
    <BaseEmail preview="Welcome to Tri-Star Pickleball!" heading="Welcome to Tri-Star Pickleball!">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        Hi {displayName ?? "there"},
      </Text>
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        Your account is all set up — you're officially part of the league. Here's what you can do next:
      </Text>
      <ul style={{ color: "#374151", fontSize: "14px", lineHeight: "28px", paddingLeft: "20px", margin: "0 0 16px" }}>
        <li>Browse upcoming sessions and sign up on the <strong>Sheets</strong> tab</li>
        <li>Check the <strong>Ladder</strong> to see current standings</li>
        <li>Complete your <strong>Profile</strong> with a photo, skill rating, and bio</li>
      </ul>
      <Button
        href={`${appUrl}/dashboard`}
        style={{
          backgroundColor: "#0ea5a0",
          borderRadius: "6px",
          color: "#ffffff",
          fontSize: "14px",
          fontWeight: "600",
          padding: "12px 24px",
          textDecoration: "none",
          display: "inline-block",
          marginTop: "8px",
        }}
      >
        Go to Dashboard
      </Button>
    </BaseEmail>
  );
}
