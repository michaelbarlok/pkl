import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  threadTitle?: string;
  threadId?: string;
  mentionedBy?: string;
  groupSlug?: string;
}

export default function ForumMention({
  threadTitle,
  threadId,
  mentionedBy,
  groupSlug,
}: Props) {
  const url = groupSlug && threadId
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/groups/${groupSlug}/forum/${threadId}`
    : "#";

  return (
    <BaseEmail preview="You were mentioned in a forum post" heading="You Were Mentioned">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        {mentionedBy ?? "Someone"} mentioned you in{" "}
        <strong>{threadTitle ?? "a forum thread"}</strong>.
      </Text>
      <Button
        href={url}
        style={{
          backgroundColor: "#2563eb",
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
