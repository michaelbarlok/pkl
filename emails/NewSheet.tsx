import { Button, Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";
import { formatDateInZone, formatTimeInZone } from "@/lib/utils";

interface Props {
  groupName?: string;
  eventDate?: string;
  eventTime?: string;
  location?: string;
  timezone?: string;
  sheetId?: string;
}

export default function NewSheet({ groupName, eventDate, eventTime, location, timezone, sheetId }: Props) {
  const tz = timezone ?? "America/New_York";
  const formattedTime = eventTime ? formatTimeInZone(eventTime, tz) : null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <BaseEmail preview="New event posted!" heading="New Sign-Up Sheet">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        A new event has been posted for <strong>{groupName ?? "your group"}</strong>!
      </Text>
      <Text style={{ color: "#374151", fontSize: "14px" }}>
        Date: {eventDate ? formatDateInZone(eventDate, tz) : "TBD"}
        {formattedTime ? ` at ${formattedTime}` : ""}
      </Text>
      {location && (
        <Text style={{ color: "#374151", fontSize: "14px" }}>
          Location: {location}
        </Text>
      )}
      <Button
        href={sheetId ? `${appUrl}/sheets/${sheetId}` : "#"}
        style={buttonStyle}
      >
        Sign Up
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
