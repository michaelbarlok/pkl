/**
 * Test-user helpers.
 *
 * Test users (seeded via script or ad-hoc SQL) prefix their display_name
 * with "[TEST]" so we can keep them around for simulation/QA without
 * cluttering the real member directory or the manual-add pickers that
 * admins use to drop someone onto a sheet or into a session.
 *
 * Intentional scope:
 *   - HIDE from the group Members tab.
 *   - HIDE from manual add-member pickers (sheet detail + session check-in).
 *   - DO NOT HIDE from ladder rankings, session participant lists, or
 *     standings — if a test user is actively playing in a session we
 *     still need them visible there, or the sim breaks.
 */

const TEST_USER_PREFIX = "[TEST]";

/** Does this display_name mark the user as a test account? */
export function isTestUser(displayName: string | null | undefined): boolean {
  if (!displayName) return false;
  return displayName.trim().toUpperCase().startsWith(TEST_USER_PREFIX);
}
