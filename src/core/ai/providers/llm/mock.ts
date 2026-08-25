import type { LLMProvider, LLMRequest, LLMResult } from "../types";
import { CARD_TYPE_MAP, CARD_TYPES, type CardTypeId } from "@/core/domain/card-types";
import { STYLE_MAP, type StyleId } from "@/core/domain/styles";
import { fallbackPrompt } from "@/core/prompting/prompt-composer";
import type { PromptIntent } from "@/core/prompting/prompt-intent";

/**
 * Deterministic, offline LLM stand-in. Produces realistic, schema-shaped JSON
 * so the whole product is usable before real tokens are wired in. Swap to the
 * `qwen` provider via env without touching the service layer.
 */
export class MockLLMProvider implements LLMProvider {
  readonly id = "mock";

  async complete(req: LLMRequest): Promise<LLMResult> {
    await delay(450);
    const ctx = req.context ?? {};
    switch (req.task) {
      case "analyze":
        return json(this.analyze(ctx));
      case "compare":
        return json(this.compare(ctx));
      case "ideas":
        return json(this.ideas(ctx));
      case "improve-prompt":
        return { text: this.improvePrompt(ctx) };
      case "build-prompt":
        return json(this.buildPrompt(ctx));
      case "write-prompt":
        return json(fallbackPrompt((ctx.intent ?? {}) as PromptIntent));
      case "score":
        return json(this.score(ctx));
      case "translate":
        // offline mock can't translate — return the text unchanged
        return { text: String(ctx.text ?? "") };
      default:
        return { text: "OK" };
    }
  }

  private productName(ctx: Record<string, unknown>): string {
    const p = (ctx.product ?? {}) as { name?: string };
    return p.name?.trim() || "товар";
  }

  private analyze(ctx: Record<string, unknown>) {
    const name = this.productName(ctx);
    return {
      observed: {
        product: name,
        existingText: [],
        composition: "Товар по центру кадра на нейтральном фоне, без текстовых блоков.",
      },
      diagnosis: `Карточка «${name}» выглядит как стоковое фото без смысловой подачи. За 2 секунды покупатель не понимает, чем товар лучше десятков аналогичных в выдаче.`,
      mainProblem:
        "На первой карточке нет считываемого УТП. Глаз не цепляется ни за выгоду, ни за акцент — товар теряется среди конкурентов.",
      whatWorks: [
        "Товар в кадре целиком и не обрезан.",
        "Освещение приемлемое, цвет товара передан достоверно.",
      ],
      problems: [
        {
          issue: "Нет короткого заголовка-выгоды в верхней зоне.",
          severity: "high",
          fix: `Добавьте заголовок до 5 слов в верхнюю левую зону, например: «${name}: без компромиссов».`,
        },
        {
          issue: "Фон шумный и отвлекает от товара.",
          severity: "medium",
          fix: "Замените фон на чистый градиент в палитре категории, оставив товар в центре.",
        },
        {
          issue: "Отсутствуют элементы доверия: гарантия, состав, сертификаты.",
          severity: "low",
          fix: "Добавьте бейдж «Гарантия 2 года» и краткий состав в нижнюю треть.",
        },
      ],
      headlineIdeas: [
        `${name}: без компромиссов`,
        `${name}, который выбирают`,
        "Комфорт на каждый день",
      ],
      benefitTexts: ["Не мнётся", "Дышащая ткань", "Гарантия 2 года"],
      textRewrites: [
        { current: "", better: `${name}: без компромиссов` },
      ],
      visualTips: [
        "Один акцентный цвет на всю серию карточек — для узнаваемости в выдаче.",
        "Оставьте 30–40% воздуха под текст — премиальность считывается через пустоту.",
        "Тени мягкие и реалистичные, без жёстких контуров — это снижает «дешёвый» вид.",
      ],
      thumbnailTest: {
        readable: false,
        verdict: "В миниатюре 200px товар различим, но без заголовка карточка не выделяется в выдаче.",
      },
      riskFlags: [],
      newCardIdeas: this.ideas(ctx).ideas.slice(0, 5),
      scores: this.score(ctx).scores ?? this.fallbackScore(),
      scoreReasons: {
        cover: "Чистое фото, но нет смысловой подачи.",
        infographics: "Инфографика отсутствует полностью.",
        text: "На карточке нет ни одной надписи.",
        composition: "Товар по центру, композиция аккуратная, но статичная.",
        trust: "Нет ни одного элемента доверия.",
        sellingPower: "Карточка не отвечает на вопрос «почему этот товар».",
      },
    };
  }

  private compare(ctx: Record<string, unknown>) {
    const name = this.productName(ctx);
    const mine = this.fallbackScore(ctx);
    const competitor = {
      cover: 70, infographics: 65, text: 60, composition: 65, trust: 55, sellingPower: 65,
      total: 63,
      comment: "Конкурент делает ставку на плашки и заголовок — карточка считывается быстрее.",
    };
    return {
      observed: {
        mine: `Карточка «${name}»: товар по центру, надписей нет.`,
        competitor: "Карточка конкурента: крупный заголовок, три плашки преимуществ, бейдж гарантии.",
      },
      verdict: "competitor",
      verdictText:
        "Пока выигрывает конкурент: его карточка отвечает на вопрос «почему купить» прямо в выдаче — заголовок и плашки, а ваша полагается только на фото. Разрыв закрывается за одну итерацию инфографики.",
      scoreMine: mine,
      scoreCompetitor: competitor,
      axisComments: {
        cover: "Фото сопоставимы, у вас даже чище фон.",
        infographics: "У конкурента три плашки, у вас — ни одной.",
        text: "Конкурент выносит выгоду в заголовок, у вас текст отсутствует.",
        composition: "Обе аккуратные; у конкурента иерархия ведёт взгляд.",
        trust: "Бейдж гарантии есть только у конкурента.",
        sellingPower: "Конкурент продаёт выгоду, вы — просто показываете товар.",
      },
      advantages: ["Чище и качественнее само фото товара.", "Нет визуального шума."],
      weaknesses: ["Нет заголовка-выгоды.", "Нет плашек преимуществ.", "Нет сигналов доверия."],
      adopt: [
        "Добавьте заголовок-выгоду до 5 слов в верхнюю треть.",
        "Вынесите три ключевых преимущества в плашки.",
        "Добавьте бейдж гарантии или состава в нижнюю треть.",
      ],
      thumbnailVerdict:
        "В миниатюре 200px заметнее конкурент: крупный заголовок читается, ваша карточка сливается с выдачей.",
    };
  }

  private ideas(ctx: Record<string, unknown>) {
    const name = this.productName(ctx);
    const pick = (id: CardTypeId) => CARD_TYPE_MAP[id];
    const ideas = [
      {
        cardType: "cover",
        title: "Обложка с главной выгодой",
        angle: "Сразу показать ключевую ценность и зацепить взгляд.",
        headline: `${name}, который выбирают`,
        keyPoints: ["Крупный товар по центру", "Заголовок-выгода слева", "Чистый градиентный фон"],
      },
      {
        cardType: "benefits",
        title: "Карточка преимуществ",
        angle: "Снять основные возражения тремя выгодами.",
        headline: "Почему стоит выбрать",
        keyPoints: ["3–5 иконок с выгодами", "Короткие подписи", "Единый акцентный цвет"],
      },
      {
        cardType: "lifestyle",
        title: "Lifestyle-сцена",
        angle: "Показать товар в реальной жизни, вызвать желание.",
        headline: "В вашей жизни",
        keyPoints: ["Естественный свет", "Контекст использования", "Аспирационное настроение"],
      },
      {
        cardType: "composition",
        title: "Состав и качество",
        angle: "Доказать качество через материалы и детали.",
        headline: "Из чего сделано",
        keyPoints: ["Макро текстуры", "Выноски к материалам", "Аккуратная типографика"],
      },
      {
        cardType: "trust",
        title: "Доверие и гарантия",
        angle: "Закрыть страх покупки гарантиями и сертификатами.",
        headline: "Вам не о чем волноваться",
        keyPoints: ["Бейдж гарантии", "Сертификаты", "Спокойная палитра"],
      },
      {
        cardType: "pain-solution",
        title: "Проблема → решение",
        angle: "Показать боль клиента и товар как решение.",
        headline: "Знакомо? Решаем",
        keyPoints: ["Две зоны: до/после", "Товар как ответ", "Чёткий контраст"],
      },
      {
        cardType: "comparison",
        title: "Сравнение с обычным товаром",
        angle: "Отстроиться от дешёвых аналогов.",
        headline: "Разница очевидна",
        keyPoints: ["Мы vs обычный", "Визуальная иерархия", "Аккуратная сетка"],
      },
    ].map((i) => ({ ...i, _t: pick(i.cardType as CardTypeId)?.title }));
    return { ideas: ideas.map(({ _t, ...rest }) => rest) };
  }

  private improvePrompt(ctx: Record<string, unknown>): string {
    const base = String(ctx.prompt ?? "").trim();
    const extras = [
      "премиальный e-commerce вид",
      "чистая редакторская композиция",
      "товар по центру и без искажений",
      "мягкий студийный свет",
      "достаточно свободного места под заголовок",
      "дорогая палитра",
      "высокая детализация, каталожное качество",
    ];
    return `${base ? base + ", " : ""}${extras.join(", ")}`;
  }

  private buildPrompt(ctx: Record<string, unknown>) {
    const product = (ctx.product ?? {}) as {
      name?: string;
      category?: string;
      audience?: string;
      benefits?: string[];
    };
    const style = STYLE_MAP[(ctx.style as StyleId) ?? "premium-minimal"];
    const type = CARD_TYPE_MAP[(ctx.cardType as CardTypeId) ?? "cover"];
    const name = product.name?.trim() || "товар";
    const benefit = product.benefits?.[0] || "качество и надёжность";
    const userPrompt = String(ctx.userPrompt ?? "").trim();

    return {
      product: name,
      marketplace: "Wildberries",
      cardType: type?.title ?? "premium cover image",
      targetAudience: product.audience || "целевая аудитория категории",
      mainBenefit: benefit,
      visualStyle: `${style.visual}${userPrompt ? `, ${userPrompt}` : ""}`,
      composition: "product centered, large, balanced layout with enough empty space for text",
      background: `${style.palette} background, subtle premium texture, no clutter`,
      lighting: style.lighting,
      typographyArea: "clean zone (top-left or bottom) reserved for headline and badges",
      colorPalette: style.palette,
      premiumDetails: "elegant lines, subtle glow, high-end catalog look",
      restrictions:
        "do not distort product, no fake logos, no messy background, no real text rendering",
      negativePrompt:
        "low quality, blurry, cheap design, distorted product, random text, extra objects, watermark, oversaturated",
    };
  }

  private score(ctx: Record<string, unknown>) {
    return { scores: this.fallbackScore(ctx) };
  }

  private fallbackScore(ctx: Record<string, unknown> = {}) {
    // deterministic pseudo-variation from product name length so it isn't static
    const seed = (this.productName(ctx).length * 7) % 12;
    const base = {
      cover: 58 + (seed % 5),
      infographics: 49 + (seed % 7),
      text: 54 + (seed % 6),
      composition: 61 + (seed % 4),
      trust: 47 + (seed % 8),
      sellingPower: 52 + (seed % 6),
    };
    const total = Math.round(
      (base.cover +
        base.infographics +
        base.text +
        base.composition +
        base.trust +
        base.sellingPower) /
        6,
    );
    return {
      ...base,
      total,
      comment:
        "Крепкая база, но карточке не хватает считываемого УТП и элементов доверия. Самый быстрый рост даст обложка с заголовком-выгодой.",
    };
  }
}

function json(obj: unknown): LLMResult {
  return { text: JSON.stringify(obj) };
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// keep CARD_TYPES referenced for tree-shaking safety / future use
void CARD_TYPES;
