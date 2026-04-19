import { Button, Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";
import { formatDateInZone, formatDateTimeInZone } from "@/lib/utils";

interface Props {
  groupName?: string;
  eventDate?: string;
  closesAt?: string;
  timezone?: string;
  sheetId?: string;
}

export default function WithdrawReminder({ groupName, eventDate, closesAt, timezone, sheetId }: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const tz = timezone ?? "America/New_York";

  return (
    <BaseEmail preview="Withdrawal window closing" heading="Withdrawal Window Closing">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        The withdrawal window for <strong>{groupName ?? "the event"}</strong> on{" "}
        {eventDate ? formatDateInZone(eventDate, tz) : "the scheduled date"} is closing soon.
      </Text>
      {closesAt && (
        <Text style={{ color: "#6b7280", fontSize: "14px" }}>
          Closes at: {formatDateTimeInZone(closesAt, tz)}
        </Text>
      )}
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        If you can&apos;t make it, please withdraw now so someone on the waitlist can take your spot.
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
