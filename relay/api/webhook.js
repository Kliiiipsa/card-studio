// Telegram → Kartogen webhook relay (Vercel, outside RU).
//
// Telegram's datacenters cannot open connections to kartogen.ru (Timeweb, RU):
// getWebhookInfo showed "Connection timed out" — the same DPI block as the
// outbound direction. So Telegram delivers updates HERE, and this function
// forwards them to the real handler on kartogen.ru with the same secret header.
//
// Env: KARTOGEN_WEBHOOK_URL (default https://kartogen.ru/api/tg/webhook).
// The secret is NOT stored here: Telegram sends X-Telegram-Bot-Api-Secret-Token
// (set in setWebhook), we pass it through verbatim and kartogen.ru verifies it.
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const secret = req.headers["x-telegram-bot-api-secret-token"] || "";
  if (!secret) return res.status(401).json({ error: "unauthorized" });
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  const target = process.env.KARTOGEN_WEBHOOK_URL || "https://kartogen.ru/api/tg/webhook";
  try {
    const r = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": secret },
      body: raw,
      signal: AbortSignal.timeout(8000),
    });
    // Telegram only needs a 200 from us; if kartogen.ru answered 401/503 we
    // still return 200 so Telegram does not retry forever, but log the status.
    if (!r.ok) console.error("kartogen webhook answered", r.status);
    return res.status(200).json({ ok: true, upstream: r.status });
  } catch (e) {
    console.error("forward failed", String(e).slice(0, 200));
    // 5xx makes Telegram retry later — the update is not lost
    return res.status(502).json({ ok: false, error: "upstream_unreachable" });
  }
};
