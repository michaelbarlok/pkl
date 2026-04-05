import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  threadTitle?: string;
  threadId?: string;
}

export default function ForumReply({ threadTitle, threadId }: Props) {
  return (
    <BaseEmail preview="New reply to your thread" heading="New Reply">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        Someone replied to your forum thread: <strong>{threadTitle ?? "your thread"}</strong>
      </Text>
      <Button
        href={threadId ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/forum/${threadId}` : "#"}
        style={{
          backgroundColor: "#14b8a6",
          borderRadius: "6px",
          color: "#ffffff",
          fontSize: "14px",
          fontWeight: "600",
          padding: "12px 24px",
          textDecoration: "none",
          display: "inline-block",
          marginTop: "16px",
        }}
      >
        View Thread
      </Button>
    </BaseEmail>
  );
}
