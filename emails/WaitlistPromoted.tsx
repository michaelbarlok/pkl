import { Button, Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";
import { formatDateInZone } from "@/lib/utils";

interface Props {
  groupName?: string;
  eventDate?: string;
  timezone?: string;
  sheetId?: string;
}

export default function WaitlistPromoted({ groupName, eventDate, timezone, sheetId }: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const tz = timezone ?? "America/New_York";

  return (
    <BaseEmail preview="You're in!" heading="You've been promoted from the waitlist!">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        A spot opened up and you&apos;ve been moved from the waitlist to the main roster for{" "}
        <strong>{groupName ?? "the event"}</strong> on{" "}
        {eventDate ? formatDateInZone(eventDate, tz) : "the upcoming date"}.
      </Text>
      <Button
        href={sheetId ? `${appUrl}/sheets/${sheetId}` : "#"}
        style={buttonStyle}
      >
        View Event
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
