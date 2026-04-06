import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  groupName: string;
  inviteUrl: string;
}

export default function GroupInvite({ groupName, inviteUrl }: Props) {
  return (
    <BaseEmail
      preview={`You've been invited to join ${groupName}`}
      heading={`Join ${groupName}`}
    >
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        You&apos;ve been invited to join a pickleball group on Tri-Star Pickleball:{" "}
        <strong>{groupName}</strong>.
      </Text>
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        Click below to view the group and join. If you don&apos;t have an
        account yet, you&apos;ll be prompted to register first — it only takes
        a minute.
      </Text>
      <Button
        href={inviteUrl}
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
        View Group &amp; Join
      </Button>
    </BaseEmail>
  );
}
