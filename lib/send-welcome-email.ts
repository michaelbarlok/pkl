import WelcomeEmail from "@/emails/WelcomeEmail";
import { isTestUser } from "@/lib/utils";

export async function sendWelcomeEmail(email: string, displayName: string): Promise<void> {
  if (isTestUser(email, displayName)) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: "Tri-Star Pickleball <info@tristarpickleball.com>",
    to: email,
    subject: "Welcome to Tri-Star Pickleball!",
    react: WelcomeEmail({ displayName }),
  });
}
