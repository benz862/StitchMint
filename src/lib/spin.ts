import { createHash, randomInt } from "node:crypto";
import { STORAGE_BUCKETS } from "@/lib/buckets";
import { getResendClient, getResendFrom } from "@/lib/resend-config";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Spin the Wheel (public lead magnet) — server-side state + draw logic.
 *
 * Everything lives in the `packages` bucket as JSON, the same no-migration pattern as
 * Batch Produce (see src/lib/batch-produce.ts). All access uses the service role.
 *
 *   spin/pool.json                     prize pool manifest (owner-stocked)
 *   spin/prizes/<file>.zip             prize ZIPs the manifest points at
 *   spin/prizes/<file>.png             optional preview images the manifest points at
 *   spin/claims/<sha256(email)>.json   one claim record per spinner (one spin / 30 days)
 *
 * The pool manifest is an array of:
 *   { id, title, theme, storagePath, previewPath? }
 * where storagePath / previewPath are paths inside the `packages` bucket.
 * If the manifest is missing or unreadable, a small built-in starter pool is used so the
 * page still renders; the owner replaces it by uploading a real spin/pool.json.
 */

/** One spin per person per this many days. */
export const SPIN_COOLDOWN_DAYS = 30;
const SPIN_COOLDOWN_MS = SPIN_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

/** Signed prize download links live this long (the win email repeats the same link). */
export const SPIN_DOWNLOAD_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Signed preview images on the public page only need to survive the page view. */
const SPIN_PREVIEW_TTL_SECONDS = 60 * 60;

export const SPIN_POOL_PATH = "spin/pool.json";
export const SPIN_CLAIMS_PREFIX = "spin/claims/";

export type SpinPrize = {
  id: string;
  title: string;
  theme: string;
  /** Path of the prize ZIP inside the `packages` bucket. */
  storagePath: string;
  /** Optional path of a preview image inside the `packages` bucket. */
  previewPath?: string;
};

export type SpinClaim = {
  email: string;
  lastSpinAt: string;
  prizeId: string;
  spinCount: number;
};

/** A pool entry as the public page consumes it: manifest fields + a signed preview URL. */
export type PublicSpinPrize = {
  id: string;
  title: string;
  theme: string;
  previewUrl: string | null;
};

export type SpinResult =
  | {
      status: "won";
      prize: PublicSpinPrize;
      downloadUrl: string | null;
      unlockDate: string;
    }
  | { status: "already_spun"; unlockDate: string }
  | { status: "empty_pool" }
  | { status: "invalid_email" };

/**
 * Fallback pool used only when spin/pool.json is missing/unreadable, so /spin never renders
 * blank. These point at the standard spin/prizes/ locations — stocking those exact files
 * (or replacing the manifest) is all the owner has to do.
 */
export const STARTER_POOL: SpinPrize[] = [
  {
    id: "lighthouse-bookmark",
    title: "Lighthouse Bookmark",
    theme: "Coastal",
    storagePath: "spin/prizes/lighthouse-bookmark.zip",
    previewPath: "spin/prizes/lighthouse-bookmark.png",
  },
  {
    id: "sleeping-cat-bookmark",
    title: "Sleeping Cat Bookmark",
    theme: "Cats & Books",
    storagePath: "spin/prizes/sleeping-cat-bookmark.zip",
    previewPath: "spin/prizes/sleeping-cat-bookmark.png",
  },
  {
    id: "porch-goose-bookmark",
    title: "Porch Goose Bookmark",
    theme: "Porch Goose",
    storagePath: "spin/prizes/porch-goose-bookmark.zip",
    previewPath: "spin/prizes/porch-goose-bookmark.png",
  },
];

/**
 * Storage surface the spin logic needs. The default implementation talks to Supabase
 * Storage via the service role; tests can inject an in-memory stub instead.
 */
export type SpinStorage = {
  /** Download + JSON-parse an object; null when missing or unparseable. */
  readJson(path: string): Promise<unknown | null>;
  /** Upload a JSON object (upsert). Throws on failure. */
  writeJson(path: string, value: unknown): Promise<void>;
  /** Signed URL for an object; null when signing fails. */
  signUrl(path: string, expiresSeconds: number): Promise<string | null>;
};

export function createSupabaseSpinStorage(): SpinStorage {
  const admin = createServiceRoleClient();
  const bucket = admin.storage.from(STORAGE_BUCKETS.packages);
  return {
    async readJson(path) {
      const { data, error } = await bucket.download(path);
      if (error || !data) return null;
      try {
        return JSON.parse(await data.text()) as unknown;
      } catch {
        return null;
      }
    },
    async writeJson(path, value) {
      const body = Buffer.from(JSON.stringify(value, null, 2), "utf8");
      const { error } = await bucket.upload(path, body, {
        contentType: "application/json",
        upsert: true,
      });
      if (error) throw new Error(error.message);
    },
    async signUrl(path, expiresSeconds) {
      const { data, error } = await bucket.createSignedUrl(path, expiresSeconds);
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    },
  };
}

let defaultStorage: SpinStorage | null = null;
function getDefaultStorage(): SpinStorage {
  if (!defaultStorage) defaultStorage = createSupabaseSpinStorage();
  return defaultStorage;
}

/** Trim + lowercase; returns null when the address is not plausibly an email. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export function spinClaimPath(normalizedEmail: string): string {
  const hash = createHash("sha256").update(normalizedEmail, "utf8").digest("hex");
  return `${SPIN_CLAIMS_PREFIX}${hash}.json`;
}

function parsePrize(raw: unknown): SpinPrize | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const storagePath = typeof o.storagePath === "string" ? o.storagePath.trim() : "";
  if (!id || !title || !storagePath) return null;
  const theme = typeof o.theme === "string" && o.theme.trim() ? o.theme.trim() : "Bookmark";
  const previewPath =
    typeof o.previewPath === "string" && o.previewPath.trim() ? o.previewPath.trim() : undefined;
  return { id, title, theme, storagePath, previewPath };
}

function parseClaim(raw: unknown): SpinClaim | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.email !== "string" || typeof o.lastSpinAt !== "string") return null;
  if (Number.isNaN(Date.parse(o.lastSpinAt))) return null;
  return {
    email: o.email,
    lastSpinAt: o.lastSpinAt,
    prizeId: typeof o.prizeId === "string" ? o.prizeId : "",
    spinCount: typeof o.spinCount === "number" && o.spinCount > 0 ? Math.floor(o.spinCount) : 1,
  };
}

/**
 * Load the prize pool. Semantics:
 * - Manifest missing/unreadable (or not an array) → the built-in starter pool.
 * - Manifest present as an array → its valid entries, even when that is zero entries
 *   (an emptied manifest is how the owner pauses the wheel → "being stocked" state).
 * Never throws.
 */
export async function loadSpinPool(storage: SpinStorage = getDefaultStorage()): Promise<SpinPrize[]> {
  try {
    const raw = await storage.readJson(SPIN_POOL_PATH);
    if (Array.isArray(raw)) {
      return raw.map(parsePrize).filter((p): p is SpinPrize => p !== null);
    }
  } catch {
    /* fall through to the starter pool */
  }
  return STARTER_POOL;
}

/** Pool entries for the public page, with preview images signed for display. */
export async function getPublicSpinPool(
  storage: SpinStorage = getDefaultStorage(),
): Promise<PublicSpinPrize[]> {
  const pool = await loadSpinPool(storage);
  return Promise.all(
    pool.map(async (prize) => ({
      id: prize.id,
      title: prize.title,
      theme: prize.theme,
      previewUrl: prize.previewPath
        ? await storage.signUrl(prize.previewPath, SPIN_PREVIEW_TTL_SECONDS)
        : null,
    })),
  );
}

function unlockDateAfter(lastSpinAtIso: string): string {
  return new Date(Date.parse(lastSpinAtIso) + SPIN_COOLDOWN_MS).toISOString();
}

/**
 * Run one spin for an email address.
 *
 * - Invalid email → { status: "invalid_email" }.
 * - Empty pool → { status: "empty_pool" } (no claim written, so joining the letter in the
 *   "being stocked" state never burns the person's first real spin).
 * - Last spin < 30 days ago → { status: "already_spun", unlockDate }; nothing is drawn
 *   and the claim is left untouched.
 * - Otherwise: uniform random draw, claim written/updated, 7-day signed download URL.
 */
export async function performSpin(
  input: { email: unknown; now?: Date },
  storage: SpinStorage = getDefaultStorage(),
): Promise<SpinResult> {
  const email = normalizeEmail(input.email);
  if (!email) return { status: "invalid_email" };

  const pool = await loadSpinPool(storage);
  if (!pool.length) return { status: "empty_pool" };

  const now = input.now ?? new Date();
  const claimPath = spinClaimPath(email);
  const existing = parseClaim(await storage.readJson(claimPath));
  if (existing) {
    const elapsed = now.getTime() - Date.parse(existing.lastSpinAt);
    if (elapsed < SPIN_COOLDOWN_MS) {
      return { status: "already_spun", unlockDate: unlockDateAfter(existing.lastSpinAt) };
    }
  }

  const prize = pool[randomInt(pool.length)];
  const claim: SpinClaim = {
    email,
    lastSpinAt: now.toISOString(),
    prizeId: prize.id,
    spinCount: (existing?.spinCount ?? 0) + 1,
  };
  await storage.writeJson(claimPath, claim);

  const downloadUrl = await storage.signUrl(prize.storagePath, SPIN_DOWNLOAD_TTL_SECONDS);
  const previewUrl = prize.previewPath
    ? await storage.signUrl(prize.previewPath, SPIN_PREVIEW_TTL_SECONDS)
    : null;

  return {
    status: "won",
    prize: { id: prize.id, title: prize.title, theme: prize.theme, previewUrl },
    downloadUrl,
    unlockDate: unlockDateAfter(claim.lastSpinAt),
  };
}

/**
 * Best-effort winner email via the app's existing Resend setup (same pattern as
 * src/lib/purchase-email.ts). Failures are logged, never thrown — the on-screen
 * download is the primary delivery path.
 */
export async function sendSpinWinnerEmail(input: {
  email: string;
  prizeTitle: string;
  downloadUrl: string | null;
  optIn: boolean;
}): Promise<void> {
  try {
    const resend = getResendClient();
    if (!resend) return;
    const downloadLine = input.downloadUrl
      ? `<p><a href="${input.downloadUrl}">Download your free bookmark pattern</a> — this link works for 7 days.</p>`
      : `<p>Your download link is on the StitchMint spin page — head back there to grab your pattern.</p>`;
    const letterLine = input.optIn
      ? `<p>You're also on the StitchMint letter list — a free pattern lands in the first issue every month. Unsubscribe anytime.</p>`
      : "";
    const { error } = await resend.emails.send({
      from: getResendFrom(),
      to: input.email,
      subject: `You won a free StitchMint bookmark — ${input.prizeTitle}`,
      html: `
<p>You spun the StitchMint wheel and won <strong>${escapeHtml(input.prizeTitle)}</strong> — a free bookmark cross stitch pattern (32 × 96 stitches).</p>
${downloadLine}
<p>Patterns are for personal use only. Want more? Browse all our bookmark patterns in the <a href="https://www.etsy.com/shop/StitchMintPatterns">StitchMint Etsy shop</a>.</p>
${letterLine}
<p>— StitchMint</p>
`.trim(),
    });
    if (error) console.error("[spin] Resend error:", error.message);
  } catch (err) {
    console.error("[spin] Winner email failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Optional lead/winner webhook: when SPIN_WINNER_WEBHOOK_URL is set (e.g. a GoHighLevel
 * workflow inbound webhook), POST the event so the lead lands in the CRM and a workflow
 * can send follow-ups. Fire-and-forget: failures are logged, never fatal.
 */
export async function notifySpinWebhook(payload: {
  event: "spin_win" | "spin_signup";
  email: string;
  optIn: boolean;
  prizeId?: string;
  prizeTitle?: string;
  downloadUrl?: string | null;
  spunAt: string;
}): Promise<void> {
  const url = process.env.SPIN_WINNER_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "stitchmint-spin", ...payload }),
    });
  } catch (err) {
    console.error("[spin] Webhook failed:", err instanceof Error ? err.message : err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
