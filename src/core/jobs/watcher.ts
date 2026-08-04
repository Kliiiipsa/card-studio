import { pollInfographicJob } from "@/core/infographics/infographic-service";
import { completeJob, failJob, processingJobs, jobsEnabled, type GenJob } from "./jobs";
import { persistImageToS3, s3Enabled } from "@/core/storage/s3";
import { applyTx, billingEnabled } from "@/core/billing/billing";
import { PRICES } from "@/core/billing/prices";
import { getUser } from "@/core/auth/store";

/**
 * In-process job watcher. We run on a persistent Node server (Timeweb app),
 * so a plain async loop is enough: it survives the user closing the tab,
 * finishes the fal job, persists the image to S3 and charges the sparks.
 * Charge reference = fal responseUrl — the same key the client status route
 * uses, so client + watcher can never double-charge.
 *
 * State lives on globalThis to survive Next.js dev HMR module reloads.
 */
type WatcherState = { watching: Set<string>; booted: boolean };
const state: WatcherState = ((globalThis as Record<string, unknown>).__genJobWatcher ??= {
  watching: new Set<string>(),
  booted: false,
}) as WatcherState;

const POLL_MS = 3000;
const MAX_POLLS = 120; // ~6 minutes

type WatchArgs = {
  id: string;
  email: string;
  falStatusUrl: string;
  falResponseUrl: string;
};

export function watchJob(args: WatchArgs): void {
  if (state.watching.has(args.id)) return;
  state.watching.add(args.id);
  void run(args).finally(() => state.watching.delete(args.id));
}

async function run(args: WatchArgs): Promise<void> {
  const handle = {
    provider: "fal-gpt-image",
    statusUrl: args.falStatusUrl,
    responseUrl: args.falResponseUrl,
  };
  let pollErrors = 0;
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_MS);
    try {
      const st = await pollInfographicJob(handle);
      if (st.status === "failed") {
        await failJob(args.id, st.error ?? "generation failed");
        return;
      }
      if (st.status === "completed" && st.images?.[0]?.url) {
        const falUrl = st.images[0].url;
        let finalUrl = falUrl;
        if (s3Enabled()) {
          try {
            finalUrl = await persistImageToS3(falUrl, `cards/${args.id}.png`);
          } catch (e) {
            // S3 hiccup → keep the fal URL rather than losing the result
            console.error("[jobs] S3 persist failed:", e);
          }
        }
        await chargeIfNeeded(args.email, args.falResponseUrl);
        await completeJob(args.id, finalUrl);
        return;
      }
    } catch (e) {
      if (++pollErrors >= 5) {
        await failJob(args.id, e instanceof Error ? e.message : "poll error");
        return;
      }
    }
  }
  await failJob(args.id, "timeout: генерация не завершилась за отведённое время");
}

async function chargeIfNeeded(email: string, reference: string): Promise<void> {
  if (!billingEnabled()) return;
  try {
    const user = await getUser(email);
    if (user?.role === "admin") return;
    await applyTx({
      email,
      amount: -PRICES.infographic,
      type: "charge",
      action: "infographic",
      reference,
    });
  } catch (e) {
    console.error("[jobs] charge failed:", e);
  }
}

/** Re-attach watchers to unfinished jobs (e.g. after a server restart). */
export function ensureWatcherBoot(): void {
  if (state.booted || !jobsEnabled()) return;
  state.booted = true;
  void processingJobs()
    .then((jobs: GenJob[]) => {
      for (const j of jobs) {
        if (j.falStatusUrl && j.falResponseUrl) {
          watchJob({
            id: j.id,
            email: j.email,
            falStatusUrl: j.falStatusUrl,
            falResponseUrl: j.falResponseUrl,
          });
        }
      }
    })
    .catch((e) => console.error("[jobs] boot failed:", e));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
