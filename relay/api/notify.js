// Kartogen → Telegram relay (hosted on Vercel, outside RU so api.telegram.org is reachable).
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const secret = process.env.RELAY_SECRET || "";
  const got = req.headers["x-relay-secret"] || "";
  if (!secret || got !== secret) return res.status(401).json({ error: "unauthorized" });
  let text = "";
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    text = b && b.text ? String(b.text) : "";
  } catch (e) {}
  if (!text.trim()) return res.status(400).json({ error: "empty_text" });
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return res.status(500).json({ error: "not_configured" });
  try {
    const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }),
    });
    const ok = r.ok;
    const detail = ok ? "" : (await r.text().catch(() => "")).slice(0, 300);
    return res.status(ok ? 200 : 502).json({ sent: ok, status: r.status, detail });
  } catch (e) {
    return res.status(502).json({ error: "telegram_unreachable", detail: String(e).slice(0, 300) });
  }
};
