import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";
import { formatDate, formatTime } from "@/lib/utils";

const REASON_LABELS: Record<string, string> = {
  lack_of_interest: "Lack of Player Interest",
  inclement_weather: "Inclement Weather",
  other: "Other",
};

interface Props {
  groupName?: string;
  eventDate?: string;
  eventTime?: string;
  sheetId?: string;
  cancellationReason?: string | null;
  cancellationMessage?: string | null;
}

export default function SheetCancelled({
  groupName,
  eventDate,
  eventTime,
  sheetId,
  cancellationReason,
  cancellationMessage,
}: Props) {
  const formattedTime = eventTime ? formatTime(eventTime) : null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const reasonLabel = cancellationReason ? REASON_LABELS[cancellationReason] : null;

  return (
    <BaseEmail preview="Event cancelled" heading="Event Cancelled">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        The {groupName ?? "pickleball"} event scheduled for{" "}
        {eventDate ? formatDate(eventDate) : "the upcoming date"}
        {formattedTime ? ` at ${formattedTime}` : ""} has been cancelled.
      </Text>

      {reasonLabel && (
        <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px", marginTop: "0" }}>
          <strong>Reason:</strong> {reasonLabel}
        </Text>
      )}

      {cancellationMessage && (
        <Text
          style={{
            color: "#374151",
            fontSize: "14px",
            lineHeight: "24px",
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            padding: "12px 16px",
            marginTop: "8px",
          }}
        >
          {cancellationMessage}
        </Text>
      )}

      <Text style={{ color: "#6b7280", fontSize: "14px", marginTop: "16px" }}>
        Have questions?{" "}
        <Link href={sheetId ? `${appUrl}/sheets/${sheetId}` : "#"} style={linkStyle}>
          Contact Group Admins
        </Link>
      </Text>
    </BaseEmail>
  );
}

const linkStyle = {
  color: "#14b8a6",
  textDecoration: "underline" as const,
};
