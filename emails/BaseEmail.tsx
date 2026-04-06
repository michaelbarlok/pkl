import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
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
          {/* Dark branded header */}
          <Section style={header}>
            <Img
              src={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/TriStarPB-dark.png`}
              width="160"
              height="auto"
              alt="Tri-Star Pickleball"
              style={logo}
            />
          </Section>

          {/* Body */}
          <Section style={body}>
            <Heading as="h2" style={h2}>
              {heading}
            </Heading>
            {children}
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Tri-Star Pickleball · You're receiving this because you have an account on tristarpickleball.com
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f1f5f9",
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  padding: "24px 0",
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  maxWidth: "560px",
  borderRadius: "10px",
  overflow: "hidden" as const,
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
};

const header = {
  backgroundColor: "#24262c",
  padding: "28px 32px",
  textAlign: "center" as const,
};

const logo = {
  margin: "0 auto",
  display: "block",
};

const body = {
  padding: "32px 32px 24px",
};

const h2 = {
  color: "#0d9490",
  fontSize: "20px",
  fontWeight: "600" as const,
  margin: "0 0 20px",
};

const hr = {
  borderColor: "#e2e8f0",
  margin: "0 32px 20px",
};

const footer = {
  color: "#94a3b8",
  fontSize: "11px",
  textAlign: "center" as const,
  padding: "0 32px 24px",
  margin: 0,
};
