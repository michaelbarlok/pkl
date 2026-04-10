import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface PaymentOption {
  method: string;
  detail: string;
}

interface Props {
  playerName: string;
  tournamentName: string;
  tournamentDate: string;
  entryFee: string;
  paymentOptions: PaymentOption[];
  tournamentUrl: string;
}

const METHOD_LABELS: Record<string, string> = {
  venmo: "Venmo",
  paypal: "PayPal",
  zelle: "Zelle",
  cash: "Cash (bring to the tournament)",
  check: "Check",
  other: "Other",
};

export default function TournamentPaymentReminder({
  playerName,
  tournamentName,
  tournamentDate,
  entryFee,
  paymentOptions,
  tournamentUrl,
}: Props) {
  return (
    <BaseEmail
      preview={`Payment reminder for ${tournamentName}`}
      heading="Entry Fee Reminder"
    >
      <Text style={text}>Hi {playerName},</Text>
      <Text style={text}>
        This is a friendly reminder that your entry fee for{" "}
        <strong>{tournamentName}</strong> ({tournamentDate}) has not been
        received yet.
      </Text>

      <Text style={feeLabel}>Entry Fee</Text>
      <Text style={feeValue}>{entryFee}</Text>

      {paymentOptions.length > 0 && (
        <>
          <Text style={sectionLabel}>How to Pay</Text>
          {paymentOptions.map((opt) => (
            <Text key={opt.method} style={paymentRow}>
              <strong>{METHOD_LABELS[opt.method] ?? opt.method}</strong>
              {opt.detail ? (
                <span style={detail}>
                  {" — "}
                  {opt.method === "paypal" || opt.method === "other" ? (
                    <Link
                      href={
                        opt.detail.startsWith("http")
                          ? opt.detail
                          : `https://${opt.detail}`
                      }
                      style={link}
                    >
                      {opt.detail}
                    </Link>
                  ) : (
                    opt.detail
                  )}
                </span>
              ) : null}
            </Text>
          ))}
        </>
      )}

      <Text style={text}>
        Please submit your payment as soon as possible to secure your spot.
        If you have already paid, please disregard this message.
      </Text>

      <Text style={text}>
        <Link href={tournamentUrl} style={link}>
          View Tournament Details
        </Link>
      </Text>
    </BaseEmail>
  );
}

const text = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const feeLabel = {
  color: "#6b7280",
  fontSize: "11px",
  fontWeight: "600" as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "16px 0 4px",
};

const feeValue = {
  color: "#0d9490",
  fontSize: "18px",
  fontWeight: "700" as const,
  margin: "0 0 16px",
};

const sectionLabel = {
  color: "#6b7280",
  fontSize: "11px",
  fontWeight: "600" as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "16px 0 8px",
};

const paymentRow = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 6px",
  paddingLeft: "12px",
  borderLeft: "3px solid #14b8a6",
};

const detail = {
  color: "#6b7280",
};

const link = {
  color: "#0d9490",
  textDecoration: "underline",
};
