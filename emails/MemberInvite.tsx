import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  displayName?: string;
}

export default function MemberInvite({ displayName }: Props) {
  return (
    <BaseEmail preview="Set up your PKL Ball account" heading="Welcome to PKL Ball">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        Hi {displayName ?? "there"},
      </Text>
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        A PKL Ball account has been created for you. Click below to
        complete your registration and join the league.
      </Text>
      <Button
        href={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/register`}
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
        Set Up Account
      </Button>
    </BaseEmail>
  );
}
