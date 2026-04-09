import MemberInvite from "@/emails/MemberInvite";
import { isTestUser } from "@/lib/utils";

export async function sendInviteEmail(
  email: string,
  displayName: string
): Promise<void> {
  if (isTestUser(email, displayName)) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: "Tri-Star Pickleball <info@tristarpickleball.com>",
    to: email,
    subject: "Your Tri-Star Pickleball account is ready to set up",
    react: MemberInvite({ displayName }),
  });
}
