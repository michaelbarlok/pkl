import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface ContactGroupAdminsProps {
  senderName: string;
  groupName: string;
  eventDate: string;
  message: string;
  sheetUrl: string;
}

export default function ContactGroupAdmins({
  senderName,
  groupName,
  eventDate,
  message,
  sheetUrl,
}: ContactGroupAdminsProps) {
  return (
    <BaseEmail
      preview={`Message from ${senderName} about ${groupName}`}
      heading={`Message from ${senderName}`}
    >
      <Text style={text}>
        <strong>{senderName}</strong> sent a message about{" "}
        <strong>{groupName}</strong> on {eventDate}:
      </Text>
      <Text style={messageBox}>{message}</Text>
      <Text style={text}>
        <Link href={sheetUrl} style={link}>
          View Sign-Up Sheet
        </Link>
      </Text>
    </BaseEmail>
  );
}

const text = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "24px",
};

const messageBox = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "24px",
  backgroundColor: "#f3f4f6",
  padding: "12px 16px",
  borderRadius: "6px",
  borderLeft: "3px solid #14b8a6",
};

const link = {
  color: "#14b8a6",
  textDecoration: "underline",
};
