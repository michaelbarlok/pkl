import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { redirect } from "next/navigation";
import Link from "next/link";

/**
 * Email confirmation / password recovery landing page.
 *
 * IMPORTANT: this is a server component that requires the user to
 * click a button before the OTP is consumed.
 *
 * Why the click-through: many email clients (Yahoo Mail, Microsoft
 * Defender, Mimecast, etc.) prefetch links to scan for phishing,
 * and modern scanners execute page JavaScript in a sandbox. The
 * previous client-component implementation auto-fired
 * `verifyOtp()` on mount, which let those scanners burn the
 * single-use token before the real user clicked. The user then
 * saw "invalid or expired" with a working session sitting on the
 * scanner's machine. (David Decker hit exactly this from Yahoo
 * Mail.)
 *
 * Scanners do not click buttons or submit forms, so guarding the
 * verify behind a server-action form preserves the token until a
 * human interacts with the page. The verify itself runs server-
 * side via the @supabase/ssr cookies plumbing, so the resulting
 * session ends up on the actual visitor's browser instead of
 * being lost mid-redirect.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token_hash = typeof sp.token_hash === "string" ? sp.token_hash : null;
  const type = typeof sp.type === "string" ? sp.type : null;
  const code = typeof sp.code === "string" ? sp.code : null;
  const next = (typeof sp.next === "string" && sp.next.startsWith("/"))
    ? sp.next
    : "/dashboard";

  // No verifiable params at all → bad link.
  if (!token_hash && !code) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-950 px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <Logo className="mx-auto h-28 w-auto" />
          <p className="text-surface-muted">
            This confirmation link is invalid or has already been used.
          </p>
          <p className="text-sm text-surface-muted">
            If you need a new confirmation email, head back to login and try
            again.
          </p>
          <Link href="/login" className="btn-secondary inline-block">
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  async function verify(formData: FormData): Promise<void> {
    "use server";
    const supabase = await createClient();
    const submittedTokenHash = formData.get("token_hash");
    const submittedType = formData.get("type");
    const submittedCode = formData.get("code");
    const submittedNext = formData.get("next");
    const dest =
      typeof submittedNext === "string" && submittedNext.startsWith("/")
        ? submittedNext
        : "/dashboard";

    if (typeof submittedCode === "string" && submittedCode) {
      const { error } = await supabase.auth.exchangeCodeForSession(
        submittedCode
      );
      if (error) {
        redirect(
          `/login?error=${encodeURIComponent(error.message)}`
        );
      }
      redirect(dest);
    }

    if (
      typeof submittedTokenHash === "string" &&
      submittedTokenHash &&
      typeof submittedType === "string" &&
      submittedType
    ) {
      // Allowlist the OTP types Supabase accepts so we can satisfy
      // the verifyOtp type union without a generic `as any`.
      const allowed = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;
      type Allowed = typeof allowed[number];
      const otpType = (allowed as readonly string[]).includes(submittedType)
        ? (submittedType as Allowed)
        : null;
      if (!otpType) {
        redirect(`/login?error=${encodeURIComponent("Unknown link type")}`);
      }
      const { error } = await supabase.auth.verifyOtp({
        token_hash: submittedTokenHash,
        type: otpType as Allowed,
      });
      if (error) {
        redirect(`/login?error=${encodeURIComponent(error.message)}`);
      }
      redirect(dest);
    }

    redirect("/login?error=invalid_link");
  }

  // Friendly text per OTP type so the button reads naturally.
  const ctaForType: Record<string, { heading: string; body: string; action: string }> = {
    recovery: {
      heading: "Reset your password",
      body: "Click below to confirm it's really you, then you'll be taken to set a new password.",
      action: "Continue to reset password",
    },
    signup: {
      heading: "Confirm your email",
      body: "Click below to finish setting up your Tri-Star Pickleball account.",
      action: "Confirm and continue",
    },
    invite: {
      heading: "Accept your invitation",
      body: "Click below to accept and finish creating your account.",
      action: "Accept invitation",
    },
    magiclink: {
      heading: "Sign in",
      body: "Click below to finish signing in.",
      action: "Continue",
    },
    email_change: {
      heading: "Confirm your new email",
      body: "Click below to finish updating your email address.",
      action: "Confirm new email",
    },
  };
  const cta = (type && ctaForType[type]) || {
    heading: "Continue",
    body: "Click below to finish.",
    action: "Continue",
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-950 px-4">
      <div className="w-full max-w-md text-center space-y-4">
        <Logo className="mx-auto h-28 w-auto" />
        <h1 className="text-xl font-semibold text-dark-100">{cta.heading}</h1>
        <p className="text-surface-muted text-sm">{cta.body}</p>
        <form action={verify} className="space-y-3">
          {token_hash ? (
            <input type="hidden" name="token_hash" value={token_hash} />
          ) : null}
          {type ? <input type="hidden" name="type" value={type} /> : null}
          {code ? <input type="hidden" name="code" value={code} /> : null}
          <input type="hidden" name="next" value={next} />
          <button type="submit" className="btn-primary w-full">
            {cta.action}
          </button>
        </form>
        <p className="text-xs text-surface-muted">
          Trouble? <Link href="/login" className="text-brand-400 hover:underline">Go to login</Link>
        </p>
      </div>
    </div>
  );
}
