import { Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  groupName?: string;
  courtNumber?: number;
}

export default function PoolAssigned({ groupName, courtNumber }: Props) {
  return (
    <BaseEmail preview={`Court ${courtNumber ?? ""} assigned`} heading="Court Assignment">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        You&apos;ve been assigned to a court for the <strong>{groupName ?? "pickleball"}</strong> session.
      </Text>
      <Text
        style={{
          fontSize: "32px",
          fontWeight: "700",
          color: "#0d9488",
          textAlign: "center" as const,
          margin: "24px 0",
        }}
      >
        Court {courtNumber ?? "?"}
      </Text>
      <Text style={{ color: "#6b7280", fontSize: "14px" }}>
        Head to your assigned court and get ready to play!
      </Text>
    </BaseEmail>
  );
}
