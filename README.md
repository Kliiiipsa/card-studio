# Kartogen

AI-студия для создания премиальных карточек товаров для маркетплейсов: анализ карточки, генерация идей, структурные промпты, text-to-image и image-to-image генерация, видео из фото, оценка карточки и экспорт под размеры маркетплейсов.

Работает **из коробки в демо-режиме (mock)** — без API-ключей. Когда появятся токены Qwen и fal.ai, провайдеры переключаются через `.env` **без изменений кода и UI**.

## Стек

Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn-style UI · Zustand · Zod · localforage (IndexedDB) · Vercel-ready.

## Запуск

```bash
npm install --ignore-scripts        # см. примечание ниже
cp .env.example .env                 # по умолчанию AI_*_PROVIDER=mock
npm run dev                          # http://localhost:3000
```

> Примечание для Windows-окружений, где `npm run`/postinstall падают с
> `spawn ...\.local\bin ENOENT`: запускайте Next напрямую через node:
> `node ./node_modules/next/dist/bin/next dev` (аналогично `build` / `start`).
> Флаг `--ignore-scripts` при установке пропускает нативный постинстолл eslint-резолвера,
> который не нужен для сборки.

## Подключение реальных моделей (когда будут токены)

Откройте `.env` и замените значения:

```env
# LLM — анализ, идеи, промпты, оценка
AI_LLM_PROVIDER=qwen
QWEN_API_KEY=ваш_ключ
# при необходимости: QWEN_BASE_URL / QWEN_TEXT_MODEL / QWEN_VISION_MODEL

# Изображения — text-to-image и image-to-image
AI_IMAGE_PROVIDER=fal
FAL_API_KEY=ваш_ключ
# при необходимости: FAL_T2I_MODEL / FAL_I2I_MODEL
```

Перезапустите сервер — всё остальное останется как есть. Ключи читаются только на
сервере (в Route Handlers) и никогда не попадают на клиент.

## Архитектура

```
UI (app/, components/)
  → Route Handlers (app/api/ai/*)        ← единственное место с ключами
    → AI Service (core/ai/service.ts)    ← 7 абстракций, парсинг/валидация
      → Provider Registry (core/ai/providers/index.ts)   ← выбор по env
        ├ LLM:   llm/qwen.ts | llm/mock.ts
        └ Image: image/fal.ts | image/mock.ts
```

7 абстракций сервиса: `analyzeProductCard`, `generateCardIdeas`,
`generatePromptForImageModel`, `improveUserPrompt`, `generateImageFromText`,
`generateImageFromReference`, `scoreGeneratedCard`.

### Страницы
- `/` — лендинг
- `/dashboard` — проекты + быстрые действия
- `/projects/[id]` — данные товара, загрузки, идеи, история генераций
- `/generator` — главный экран (3 панели: ввод / превью / рекомендации+оценка)
- `/analysis` — аудит карточки маркетплейса + оценка 0–100 по 6 осям
- `/prompt-studio` — работа с промптами и шаблонами

### API
`POST /api/ai/{analyze, ideas, improve-prompt, build-prompt, generate/text,
generate/image, score}` · `GET /api/ai/status`.

Все запросы валидируются Zod, изображения проверяются по MIME и размеру (≤ 8 МБ),
ошибки провайдеров отдаются понятными сообщениями и не роняют приложение.

## Хранение

MVP хранит проекты, генерации и шаблоны локально в IndexedDB (localforage).
Слой репозитория (`core/storage/repository.ts`) можно заменить на
Supabase/Postgres без изменения UI.

## Скрипты

| Действие | Команда (через npm) | Прямой запуск (если npm падает) |
|---|---|---|
| Dev | `npm run dev` | `node ./node_modules/next/dist/bin/next dev` |
| Build | `npm run build` | `node ./node_modules/next/dist/bin/next build` |
| Start | `npm start` | `node ./node_modules/next/dist/bin/next start` |
| Typecheck | `npm run typecheck` | `node ./node_modules/typescript/bin/tsc --noEmit` |
