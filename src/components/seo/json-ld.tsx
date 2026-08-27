/**
 * Server-rendered Schema.org JSON-LD. Ставится на ПУБЛИЧНЫЕ страницы (лендинг) —
 * поисковики и нейропоиск (Яндекс Нейро, GPT, Perplexity и т.п.) читают эти
 * данные как факты о сервисе: что это, для кого, цены. Рендерится в HTML на
 * сервере, поэтому доступно краулерам без JS.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify безопасен: данные наши, не пользовательские
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
