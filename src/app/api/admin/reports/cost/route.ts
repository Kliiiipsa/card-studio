import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { totalUserBalance } from "@/core/billing/billing";
import { readFalBalance } from "@/core/ai/fal-cost";
import { falSpendUsdSince } from "@/core/jobs/jobs";
import { RUB_PER_USD, FAL_COST_PER_GENE } from "@/core/billing/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Аналитика затрат для «Отчётов»: сколько генов на балансах пользователей
 * (наши обязательства), сколько денег на fal и на сколько их хватит с учётом
 * реального расхода — надо ли пополнять и когда.
 */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);

    const [{ totalGenes, accounts }, falUsd, spend7dUsd, spend24hUsd] = await Promise.all([
      totalUserBalance(),
      readFalBalance(),
      falSpendUsdSince(24 * 7),
      falSpendUsdSince(24),
    ]);

    const falRub = falUsd === null ? null : falUsd * RUB_PER_USD;
    // обязательства: если пользователи потратят свои гены — сколько fal уйдёт
    const liabilityWorstRub = Math.round(totalGenes * FAL_COST_PER_GENE.worst);
    const liabilityTypicalRub = Math.round(totalGenes * FAL_COST_PER_GENE.typical);

    // расход в день по последней неделе (устойчивее суточного); в рублях
    const burnPerDayRub = (spend7dUsd / 7) * RUB_PER_USD;
    const runwayDays =
      falRub !== null && burnPerDayRub > 0 ? Math.floor(falRub / burnPerDayRub) : null;

    // статус: красный — не покрываем обязательства худшего случая или < 3 дней;
    // жёлтый — < 10 дней или не покрываем типичные обязательства; иначе зелёный
    let status: "green" | "amber" | "red" = "green";
    let advice = "Баланса fal хватает — пополнять не нужно.";
    if (falRub === null) {
      status = "amber";
      advice = "Не удалось прочитать баланс fal — проверьте ключ.";
    } else if (falRub < liabilityWorstRub || (runwayDays !== null && runwayDays < 3)) {
      status = "red";
      advice =
        runwayDays !== null && runwayDays < 3
          ? `Пополните fal сейчас — при текущем расходе хватит примерно на ${runwayDays} дн.`
          : "Пополните fal — баланса не хватит, если пользователи потратят свои гены.";
    } else if ((runwayDays !== null && runwayDays < 10) || falRub < liabilityTypicalRub) {
      status = "amber";
      advice =
        runwayDays !== null
          ? `Скоро пополнить fal — хватит примерно на ${runwayDays} дн.`
          : "Скоро пополнить fal.";
    }

    return ok({
      outstandingGenes: totalGenes,
      accounts,
      liabilityWorstRub,
      liabilityTypicalRub,
      falUsd,
      falRub: falRub === null ? null : Math.round(falRub),
      spend24hRub: Math.round(spend24hUsd * RUB_PER_USD),
      spend7dRub: Math.round(spend7dUsd * RUB_PER_USD),
      burnPerDayRub: Math.round(burnPerDayRub),
      runwayDays,
      status,
      advice,
      rubPerUsd: RUB_PER_USD,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return fail(err);
  }
}
