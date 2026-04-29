import { createClient, createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClaimAndRedirect } from "./claim-and-redirect";

/**
 * Landing page for a tournament partner-invite link. Lives outside
 * (app) so middleware doesn't bounce unauthenticated visitors before
 * they can see the invite context.
 *
 * Logic:
 *
 *   1. Validate the token (existence, status, expiry). Show a clear
 *      error page if it's bad.
 *   2. Show inviter + tournament context so the invitee knows what
 *      they're being asked to do.
 *   3. If logged out: present Sign-up / Log-in CTAs that round-trip
 *      back here via ?next=.
 *   4. If logged in: render the ClaimAndRedirect client component
 *      which auto-fires the claim API and redirects to the tournament
 *      page on success.
 */
export default async function PartnerInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) notFound();

  const service = await createServiceClient();
  const { data: invite } = await service
    .from("tournament_partner_invites")
    .select(
      `id, status, expires_at, inviter_id, tournament_id,
       inviter:profiles!tournament_partner_invites_inviter_id_fkey(display_name),
       tournament:tournaments(title, type, status, registration_closes_at),
       registration:tournament_registrations(division, partner_id, status)`
    )
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return (
      <ErrorShell
        title="Invite not found"
        body="This partner invite link is invalid. Ask the person who sent it to generate a new one."
      />
    );
  }

  const expired = invite.expires_at && new Date(invite.expires_at) < new Date();
  const inviterName =
    (invite.inviter as { display_name?: string } | { display_name?: string }[] | null)
      ? Array.isArray(invite.inviter)
        ? (invite.inviter[0] as { display_name?: string } | undefined)?.display_name
        : (invite.inviter as { display_name?: string }).display_name
      : null;
  const tournament = Array.isArray(invite.tournament)
    ? invite.tournament[0]
    : invite.tournament;
  const registration = Array.isArray(invite.registration)
    ? invite.registration[0]
    : invite.registration;

  if (invite.status === "claimed") {
    return (
      <ErrorShell
        title="Invite already used"
        body={`This invite was already claimed.${
          tournament?.title
            ? ` View the tournament for current registration details.`
            : ""
        }`}
        action={
          tournament?.title
            ? { label: "View tournament", href: `/tournaments/${invite.tournament_id}` }
            : undefined
        }
      />
    );
  }
  if (invite.status === "cancelled" || expired) {
    return (
      <ErrorShell
        title="Invite no longer valid"
        body="This partner invite has expired or been cancelled. Ask the person who sent it to send a new one."
      />
    );
  }
  if (registration?.partner_id) {
    return (
      <ErrorShell
        title="Already partnered"
        body={`${
          inviterName ?? "The person who invited you"
        } already has a partner for this tournament.`}
      />
    );
  }
  if (registration?.status === "withdrawn") {
    return (
      <ErrorShell
        title="Registration withdrawn"
        body={`${
          inviterName ?? "The person who invited you"
        } has withdrawn their registration, so this invite no longer points anywhere.`}
      />
    );
  }
  if (tournament && tournament.status !== "registration_open") {
    return (
      <ErrorShell
        title="Registration is closed"
        body={`Registration is no longer open for ${
          tournament?.title ?? "this tournament"
        }.`}
      />
    );
  }

  // Auth state. We use the regular client (cookies) so the UI knows
  // who's looking at the link.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let viewerProfileId: string | null = null;
  if (user) {
    const { data: vp } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    viewerProfileId = vp?.id ?? null;
  }

  // The inviter clicking their own link gets a friendly "this is your
  // own invite, share it instead" message rather than a confusing 400
  // from the claim endpoint.
  if (viewerProfileId && viewerProfileId === invite.inviter_id) {
    redirect(`/tournaments/${invite.tournament_id}`);
  }

  const tournamentTitle = tournament?.title ?? "a tournament";
  const heading = inviterName
    ? `${inviterName} wants to be your partner`
    : "You've been invited as a partner";
  const subheading = `Confirm to join their team for ${tournamentTitle}.`;

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-6">
      <div className="card max-w-md w-full space-y-4 text-center">
        <h1 className="text-2xl font-bold text-dark-100">{heading}</h1>
        <p className="text-sm text-surface-muted">{subheading}</p>

        {viewerProfileId ? (
          // ClaimAndRedirect fires the claim POST as soon as it
          // mounts and forwards the user to the tournament page on
          // success. Keeps the round-trip from /register → here →
          // tournament invisible to the user.
          <ClaimAndRedirect
            token={token}
            tournamentId={invite.tournament_id}
            inviterName={inviterName ?? null}
            tournamentTitle={tournamentTitle}
          />
        ) : (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-surface-muted">
              Sign in or create an account to accept the partnership.
            </p>
            <Link
              href={`/register?next=${encodeURIComponent(
                `/invite/partner/${token}`
              )}`}
              className="btn-primary w-full block"
            >
              Create account
            </Link>
            <Link
              href={`/login?next=${encodeURIComponent(`/invite/partner/${token}`)}`}
              className="btn-secondary w-full block"
            >
              I already have an account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorShell({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-6">
      <div className="card max-w-md w-full space-y-3 text-center">
        <h1 className="text-xl font-semibold text-dark-100">{title}</h1>
        <p className="text-sm text-surface-muted">{body}</p>
        {action ? (
          <Link href={action.href} className="btn-primary inline-block">
            {action.label}
          </Link>
        ) : (
          <Link href="/" className="text-sm text-brand-vivid hover:opacity-80">
            Go home
          </Link>
        )}
      </div>
    </div>
  );
}
