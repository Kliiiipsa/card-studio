import { insertCompletedJob, jobsEnabled } from "./jobs";
import { persistImageToS3, s3Enabled } from "@/core/storage/s3";
import { uid } from "@/lib/utils";

/**
 * Persist a finished synchronous generation: copy the provider's temporary
 * image URL into our S3 and record it in gen_jobs («Мои карточки»).
 * Returns the permanent URL (falls back to the source URL when S3/PG are
 * unavailable — the user still gets their image).
 */
export async function persistGeneration(args: {
  email: string;
  kind: "generator" | "infographic" | "improve";
  sourceUrl: string;
  payload: unknown;
}): Promise<string> {
  let url = args.sourceUrl;
  let bytes: number | undefined;
  const id = uid("card");
  if (s3Enabled() && /^https?:\/\//.test(args.sourceUrl)) {
    try {
      const ext = args.sourceUrl.includes(".jpeg") || args.sourceUrl.includes(".jpg") ? "jpg" : "png";
      const saved = await persistImageToS3(args.sourceUrl, `cards/${id}.${ext}`);
      url = saved.url;
      bytes = saved.bytes;
    } catch (e) {
      console.error("[persist] S3 failed:", e);
    }
  }
  if (jobsEnabled()) {
    try {
      await insertCompletedJob({
        id,
        email: args.email,
        kind: args.kind,
        payload: args.payload,
        resultUrl: url,
        sizeBytes: bytes,
      });
    } catch (e) {
      console.error("[persist] record failed:", e);
    }
  }
  return url;
}
