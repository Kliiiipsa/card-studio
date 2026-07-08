import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { infographicStatusSchema } from "@/core/infographics/schemas";
import { pollInfographicJob } from "@/core/infographics/infographic-service";

export const runtime = "nodejs";
// A single poll is a couple of short HTTP round-trips — quick by design.
export const maxDuration = 30;

/** Only fal queue hosts may be polled — the job URLs come from the client. */
function assertFalUrl(raw: string): void {
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new AppError("Некорректный адрес задачи.");
  }
  if (host !== "queue.fal.run" && host !== "fal.run" && !host.endsWith(".fal.run")) {
    throw new AppError("Недопустимый адрес задачи.");
  }
}

export async function POST(req: Request) {
  try {
    const { job } = await parseBody(req, infographicStatusSchema);
    assertFalUrl(job.statusUrl);
    assertFalUrl(job.responseUrl);
    const status = await pollInfographicJob(job);
    return ok(status);
  } catch (err) {
    return fail(err);
  }
}
