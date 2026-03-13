import { Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  groupName?: string;
  eventDate?: string;
  eventTime?: string;
}

export default function SheetCancelled({ groupName, eventDate, eventTime }: Props) {
  const formattedTime = eventTime
    ? new Date(eventTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <BaseEmail preview="Event cancelled" heading="Event Cancelled">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        The {groupName ?? "pickleball"} event scheduled for{" "}
        {eventDate ? new Date(eventDate).toLocaleDateString() : "the upcoming date"}
        {formattedTime ? ` at ${formattedTime}` : ""} has been
        cancelled by the admin.
      </Text>
      <Text style={{ color: "#6b7280", fontSize: "14px" }}>
        If you have any questions, please reach out to the league admin.
      </Text>
    </BaseEmail>
  );
}
