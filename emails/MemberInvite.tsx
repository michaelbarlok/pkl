import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  displayName?: string;
  message?: string;
}

export default function MemberInvite({ displayName, message }: Props) {
  return (
    <BaseEmail preview="Set up your Tri-Star Pickleball account" heading="Welcome to Tri-Star Pickleball">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        Hi {displayName ?? "there"},
      </Text>
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        A Tri-Star Pickleball account has been created for you. Click below to
        complete your registration and join the league.
      </Text>
      {message && (
        <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px", borderLeft: "3px solid #0ea5a0", paddingLeft: "12px", marginTop: "8px" }}>
          {message}
        </Text>
      )}
      <Button
        href={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/register`}
        style={{
          backgroundColor: "#0ea5a0",
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
        Set Up Account
      </Button>
    </BaseEmail>
  );
}
