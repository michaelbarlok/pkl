import MemberInvite from "@/emails/MemberInvite";

export async function sendInviteEmail(
  email: string,
  displayName: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: "PKL <info@pkl-ball.app>",
    to: email,
    subject: "You've been invited to PKL!",
    react: MemberInvite({ displayName }),
  });
}
