import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";
import { formatDate, formatTime } from "@/lib/utils";

interface Props {
  groupName?: string;
  eventDate?: string;
  eventTime?: string;
  sheetId?: string;
}

export default function SheetCancelled({ groupName, eventDate, eventTime, sheetId }: Props) {
  const formattedTime = eventTime ? formatTime(eventTime) : null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <BaseEmail preview="Event cancelled" heading="Event Cancelled">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        The {groupName ?? "pickleball"} event scheduled for{" "}
        {eventDate ? formatDate(eventDate) : "the upcoming date"}
        {formattedTime ? ` at ${formattedTime}` : ""} has been
        cancelled by the admin.
      </Text>
      <Text style={{ color: "#6b7280", fontSize: "14px" }}>
        Have questions?{" "}
        <Link href={sheetId ? `${appUrl}/sheets/${sheetId}` : "#"} style={linkStyle}>
          Contact Group Admins
        </Link>
      </Text>
    </BaseEmail>
  );
}

const linkStyle = {
  color: "#6366f1",
  textDecoration: "underline" as const,
};
