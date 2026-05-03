import { randomUUID } from "node:crypto";
import { STORAGE_BUCKETS } from "@/lib/buckets";
import { createSignedDownloadUrl } from "@/lib/pattern-service";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Puts a generated admin demo ZIP in Storage and returns a short-lived signed GET URL
 * so the browser downloads directly from Supabase (avoids Vercel ~4–6MB response body limits).
 */
export async function uploadAdminDemoZipAndSignUrl(adminUserId: string, zipBuffer: Buffer): Promise<{ url: string }> {
  const admin = createServiceRoleClient();
  const id = randomUUID();
  const path = `__admin_demo__/${adminUserId}/${id}.zip`;
  const { error } = await admin.storage.from(STORAGE_BUCKETS.packages).upload(path, zipBuffer, {
    contentType: "application/zip",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const url = await createSignedDownloadUrl(STORAGE_BUCKETS.packages, path, 60 * 15);
  return { url };
}
