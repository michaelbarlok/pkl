import { Button, Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";
import { formatDate, formatDateTime } from "@/lib/utils";

interface Props {
  groupName?: string;
  eventDate?: string;
  closesAt?: string;
  sheetId?: string;
}

export default function SignupReminder({ groupName, eventDate, closesAt, sheetId }: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <BaseEmail preview="Sign-up closing soon!" heading="Don't miss out!">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        Sign-up for <strong>{groupName ?? "the event"}</strong> on{" "}
        {eventDate ? formatDate(eventDate) : "an upcoming date"} is closing soon.
      </Text>
      {closesAt && (
        <Text style={{ color: "#6b7280", fontSize: "14px" }}>
          Closes at: {formatDateTime(closesAt)}
        </Text>
      )}
      <Button
        href={sheetId ? `${appUrl}/sheets/${sheetId}` : "#"}
        style={buttonStyle}
      >
        Sign Up Now
      </Button>
      <Text style={{ color: "#6b7280", fontSize: "13px", marginTop: "20px" }}>
        Have questions?{" "}
        <Link href={sheetId ? `${appUrl}/sheets/${sheetId}` : "#"} style={linkStyle}>
          Contact Group Admins
        </Link>
      </Text>
    </BaseEmail>
  );
}

const buttonStyle = {
  backgroundColor: "#14b8a6",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600" as const,
  padding: "12px 24px",
  textDecoration: "none" as const,
  display: "inline-block" as const,
  marginTop: "16px",
};

const linkStyle = {
  color: "#14b8a6",
  textDecoration: "underline" as const,
};
