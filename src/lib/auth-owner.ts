const DEFAULT_OWNER_EMAILS = ["info@skillbinder.com"] as const;

/**
 * Owner allowlist for unlimited StitchMint access.
 *
 * OWNER_EMAILS is a comma-separated, server-only environment variable. When it is
 * unset, Glenn's corrected owner address (info@skillbinder.com) is the default.
 * If OWNER_EMAILS is explicitly set, its contents replace the default entirely.
 */
export function getOwnerEmails(): string[] {
  const configured = process.env.OWNER_EMAILS;
  if (configured === undefined) return [...DEFAULT_OWNER_EMAILS];

  return configured
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return getOwnerEmails().includes(email.trim().toLowerCase());
}
