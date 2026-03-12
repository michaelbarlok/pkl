import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface BaseEmailProps {
  preview: string;
  heading: string;
  children: React.ReactNode;
}

export default function BaseEmail({ preview, heading, children }: BaseEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>PKL</Heading>
          <Hr style={hr} />
          <Heading as="h2" style={h2}>
            {heading}
          </Heading>
          <Section>{children}</Section>
          <Hr style={hr} />
          <Text style={footer}>
            PKL Ladder League
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "560px",
  borderRadius: "8px",
};

const h1 = {
  color: "#1e40af",
  fontSize: "24px",
  fontWeight: "700" as const,
  margin: "0 0 16px",
};

const h2 = {
  color: "#111827",
  fontSize: "20px",
  fontWeight: "600" as const,
  margin: "16px 0",
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "20px 0",
};

const footer = {
  color: "#9ca3af",
  fontSize: "12px",
};
