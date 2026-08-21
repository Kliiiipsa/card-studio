import { pollInfographicJob } from "@/core/infographics/infographic-service";
import { pollVideoJob } from "@/core/video/video-service";
import { completeJob, failJob, processingJobs, jobsEnabled, setJobCost, type GenJob } from "./jobs";
import { settleFalCost, falJobStarted, falJobFinished } from "@/core/ai/fal-cost";
import { persistImageToS3, s3Enabled } from "@/core/storage/s3";
import { applyTx, billingEnabled } from "@/core/billing/billing";
import { effectivePrice, consumePriceListUse } from "@/core/billing/promo";
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

/** watchable fal-queue job kinds; charge action == kind, оба есть в PRICES */
type WatchKind = "infographic" | "video";

type WatchArgs = {
  id: string;
  email: string;
  falStatusUrl: string;
  falResponseUrl: string;
  /** default "infographic" — legacy call sites don't pass it */
  kind?: WatchKind;
  /** остаток на счёте fal перед отправкой задачи — база для расчёта цены */
  falBalanceBefore?: number | null;
  /** сколько задач fal было в работе на старте (для отметки точности) */
  concurrentAtStart?: number;
};

export function watchJob(args: WatchArgs): void {
  if (state.watching.has(args.id)) return;
  state.watching.add(args.id);
  falJobStarted();
  void run(args).finally(() => {
    state.watching.delete(args.id);
    falJobFinished();
  });
}

/** Poll one step of the underlying fal job; returns the result URL when done. */
async function pollOnce(
  kind: WatchKind,
  handle: { provider: string; statusUrl: string; responseUrl: string },
): Promise<{ status: "pending" | "completed" | "failed"; url?: string; error?: string }> {
  if (kind === "video") {
    const st = await pollVideoJob(handle);
    return { status: st.status, url: st.videoUrl, error: st.error };
  }
  const st = await pollInfographicJob(handle);
  return { status: st.status, url: st.images?.[0]?.url, error: st.error };
}

async function run(args: WatchArgs): Promise<void> {
  const kind: WatchKind = args.kind ?? "infographic";
  const handle = {
    provider: kind === "video" ? "fal-video" : "fal-gpt-image",
    statusUrl: args.falStatusUrl,
    responseUrl: args.falResponseUrl,
  };
  let pollErrors = 0;
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_MS);
    try {
      const st = await pollOnce(kind, handle);
      if (st.status === "failed") {
        await failJob(args.id, st.error ?? "generation failed");
        return;
      }
      if (st.status === "completed" && st.url) {
        const falUrl = st.url;
        let finalUrl = falUrl;
        let sizeBytes: number | undefined;
        if (s3Enabled()) {
          try {
            const key = kind === "video" ? `videos/${args.id}.mp4` : `cards/${args.id}.png`;
            const saved = await persistImageToS3(falUrl, key);
            finalUrl = saved.url;
            sizeBytes = saved.bytes;
          } catch (e) {
            // S3 hiccup → keep the fal URL rather than losing the result
            console.error("[jobs] S3 persist failed:", e);
          }
        }
        await chargeIfNeeded(args.email, args.falResponseUrl, kind);
        await completeJob(args.id, finalUrl, sizeBytes);
        // фактическая себестоимость: сколько fal списал за эту задачу
        try {
          const cost = await settleFalCost(args.falBalanceBefore, {
            concurrentAtStart: args.concurrentAtStart,
          });
          await setJobCost(args.id, cost.usd, cost.exact);
        } catch (e) {
          console.error("[jobs] cost measure failed:", e);
        }
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

async function chargeIfNeeded(email: string, reference: string, kind: WatchKind): Promise<void> {
  if (!billingEnabled()) return;
  try {
    const user = await getUser(email);
    if (user?.role === "admin") return;
    // цена та же, что проверялась на старте: спец-прайс промокода или общий
    const { price, viaPromo } = await effectivePrice(email, kind);
    const { applied } = await applyTx({
      email,
      amount: -price,
      type: "charge",
      action: kind,
      reference,
      comment: viaPromo ? `Спец-цена по промокоду ${viaPromo}` : undefined,
    });
    if (applied && viaPromo) await consumePriceListUse(email, viaPromo);
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
            kind: j.kind === "video" ? "video" : "infographic",
          });
        }
      }
    })
    .catch((e) => console.error("[jobs] boot failed:", e));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
