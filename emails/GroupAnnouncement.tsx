import { Img, Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  groupName?: string;
  title?: string;
  message?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
}

export default function GroupAnnouncement({
  groupName,
  title,
  message,
  attachmentUrl,
  attachmentName,
  attachmentType,
}: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const isImage = attachmentType?.startsWith("image/");

  return (
    <BaseEmail
      preview={title ?? `Announcement from ${groupName ?? "your group"}`}
      heading={title ?? "Group Announcement"}
    >
      <Text style={{ color: "#374151", fontSize: "13px", lineHeight: "18px", marginBottom: "4px" }}>
        From <strong>{groupName ?? "your group"}</strong>
      </Text>

      <Text
        style={{
          color: "#111827",
          fontSize: "14px",
          lineHeight: "24px",
          backgroundColor: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "6px",
          padding: "14px 16px",
          whiteSpace: "pre-wrap" as const,
          margin: "8px 0 16px",
        }}
      >
        {message}
      </Text>

      {attachmentUrl && isImage && (
        <Img
          src={attachmentUrl}
          alt={attachmentName ?? "Attachment"}
          style={{
            maxWidth: "100%",
            borderRadius: "6px",
            border: "1px solid #e2e8f0",
            margin: "0 0 16px",
          }}
        />
      )}

      {attachmentUrl && !isImage && (
        <Text style={{ margin: "0 0 16px", fontSize: "13px" }}>
          <Link href={attachmentUrl} style={{ color: "#14b8a6", textDecoration: "underline" }}>
            📎 {attachmentName ?? "Open attachment"}
          </Link>
        </Text>
      )}

      <Text style={{ color: "#6b7280", fontSize: "13px" }}>
        <Link href={`${appUrl}/groups`} style={{ color: "#14b8a6", textDecoration: "underline" }}>
          View your groups →
        </Link>
      </Text>
    </BaseEmail>
  );
}
