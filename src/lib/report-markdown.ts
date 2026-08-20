import type { AnalysisReport } from "@/core/domain/types";

const SEVERITY_RU: Record<string, string> = {
  high: "критично",
  medium: "важно",
  low: "полировка",
};

/** Render the analysis report as shareable markdown (clipboard export). */
export function reportToMarkdown(r: AnalysisReport, productName?: string): string {
  const lines: string[] = [];
  const section = (title: string) => lines.push("", `## ${title}`, "");
  const list = (items: string[]) => items.forEach((i) => lines.push(`- ${i}`));

  lines.push(`# Анализ карточки${productName ? ` — ${productName}` : ""}`);
  lines.push("", `Общий балл: **${r.scores.total}/100**`);

  if (r.observed.product || r.observed.composition) {
    section("Что видит ИИ");
    if (r.observed.product) lines.push(`- Товар: ${r.observed.product}`);
    if (r.observed.composition) lines.push(`- Композиция: ${r.observed.composition}`);
    if (r.observed.existingText.length)
      lines.push(`- Надписи: ${r.observed.existingText.map((t) => `«${t}»`).join(", ")}`);
  }

  section("Диагноз");
  lines.push(r.diagnosis, "", `**Главная проблема:** ${r.mainProblem}`);

  if (r.problems.length) {
    section("Проблемы и исправления");
    r.problems.forEach((p) =>
      lines.push(`- **[${SEVERITY_RU[p.severity] ?? p.severity}]** ${p.issue}${p.fix ? ` → ${p.fix}` : ""}`),
    );
  }

  if (r.whatWorks.length) {
    section("Что хорошо");
    list(r.whatWorks);
  }

  if (r.headlineIdeas.length || r.benefitTexts.length || r.textRewrites.length) {
    section("Готовые тексты");
    if (r.headlineIdeas.length)
      lines.push(`Заголовки: ${r.headlineIdeas.map((h) => `«${h}»`).join(" · ")}`);
    if (r.benefitTexts.length)
      lines.push(`Плашки: ${r.benefitTexts.map((b) => `«${b}»`).join(" · ")}`);
    r.textRewrites.forEach((t) =>
      lines.push(`- ${t.current ? `«${t.current}»` : "(нет текста)"} → «${t.better}»`),
    );
  }

  if (r.visualTips.length) {
    section("Визуал");
    list(r.visualTips);
  }

  section("Тест миниатюры");
  lines.push(`${r.thumbnailTest.readable ? "✅ Читается" : "❌ Не читается"}. ${r.thumbnailTest.verdict}`);

  if (r.riskFlags.length) {
    section("Риски модерации маркетплейса");
    list(r.riskFlags);
  }

  if (r.newCardIdeas.length) {
    section("Идеи новых карточек");
    r.newCardIdeas.forEach((i) =>
      lines.push(`- **${i.title}** (${i.cardType}): ${i.angle}${i.headline ? ` — «${i.headline}»` : ""}`),
    );
  }

  section("Оценки");
  const axes: [string, number][] = [
    ["Обложка", r.scores.cover],
    ["Инфографика", r.scores.infographics],
    ["Текст", r.scores.text],
    ["Композиция", r.scores.composition],
    ["Доверие", r.scores.trust],
    ["Продающая сила", r.scores.sellingPower],
  ];
  const reasonKeys = ["cover", "infographics", "text", "composition", "trust", "sellingPower"];
  axes.forEach(([label, v], i) => {
    const reason = r.scoreReasons?.[reasonKeys[i]];
    lines.push(`- ${label}: **${v}**${reason ? ` — ${reason}` : ""}`);
  });

  return lines.join("\n");
}
