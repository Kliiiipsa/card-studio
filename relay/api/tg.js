// Kartogen → Telegram Bot API proxy (hosted on Vercel, outside RU: api.telegram.org
// is DPI-blocked from the Timeweb datacenter where kartogen.ru runs).
//
// POST { token, method, params }            → forwards to /bot<token>/<method>, returns Telegram's JSON
// POST { token, method: "getFileBytes", params: { file_path } }
//                                           → downloads /file/bot<token>/<file_path>, returns { ok, base64, contentType }
//
// Gate: header x-relay-secret must equal env RELAY_SECRET (same secret as api/notify.js).
// Deployed with relay/deploy.mjs (Vercel REST API; npm/npx are broken on the dev box).
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const secret = process.env.RELAY_SECRET || "";
  const got = req.headers["x-relay-secret"] || "";
  if (!secret || got !== secret) return res.status(401).json({ error: "unauthorized" });

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {}
  const token = String(body.token || process.env.TELEGRAM_BOT_TOKEN || "");
  const method = String(body.method || "");
  const params = body.params && typeof body.params === "object" ? body.params : {};
  if (!token || !/^[A-Za-z0-9_-]{1,64}$/.test(method)) return res.status(400).json({ error: "bad_request" });

  try {
    if (method === "getFileBytes") {
      const path = String(params.file_path || "");
      if (!path || path.includes("..")) return res.status(400).json({ error: "bad_file_path" });
      const r = await fetch("https://api.telegram.org/file/bot" + token + "/" + path);
      if (!r.ok) return res.status(502).json({ ok: false, status: r.status });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 6 * 1024 * 1024) return res.status(413).json({ ok: false, error: "too_large" });
      return res.status(200).json({
        ok: true,
        contentType: r.headers.get("content-type") || "application/octet-stream",
        base64: buf.toString("base64"),
      });
    }
    const r = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const text = await r.text();
    res.status(r.ok ? 200 : 502).setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (e) {
    return res.status(502).json({ ok: false, error: "telegram_unreachable", detail: String(e).slice(0, 300) });
  }
};
