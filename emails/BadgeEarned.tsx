import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  badgeName?: string;
  playerUrl?: string;
}

export default function BadgeEarned({ badgeName, playerUrl }: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <BaseEmail preview="Badge Unlocked!" heading="You earned a new badge!">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        Congratulations! You just unlocked the{" "}
        <strong>{badgeName ?? "a new badge"}</strong> badge. Keep playing to
        earn more achievements!
      </Text>
      <Button
        href={playerUrl ? `${appUrl}${playerUrl}` : "#"}
        style={buttonStyle}
      >
        View My Badges
      </Button>
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
