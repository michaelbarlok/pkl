import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  displayName?: string;
}

export default function MemberInvite({ displayName }: Props) {
  return (
    <BaseEmail preview="You've been invited!" heading="Welcome to Athens Pickleball — Athens, TN!">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        Hi {displayName ?? "there"},
      </Text>
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        You&apos;ve been invited to join the Athens Pickleball Ladder League. Click below to set up
        your account and start playing!
      </Text>
      <Button
        href={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/register`}
        style={{
          backgroundColor: "#2563eb",
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
