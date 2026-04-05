import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface ContactTournamentOrganizersProps {
  senderName: string;
  tournamentName: string;
  message: string;
  tournamentUrl: string;
}

export default function ContactTournamentOrganizers({
  senderName,
  tournamentName,
  message,
  tournamentUrl,
}: ContactTournamentOrganizersProps) {
  return (
    <BaseEmail
      preview={`Message from ${senderName} about ${tournamentName}`}
      heading={`Message from ${senderName}`}
    >
      <Text style={text}>
        <strong>{senderName}</strong> sent a message about the tournament{" "}
        <strong>{tournamentName}</strong>:
      </Text>
      <Text style={messageBox}>{message}</Text>
      <Text style={text}>
        <Link href={tournamentUrl} style={link}>
          View Tournament
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
