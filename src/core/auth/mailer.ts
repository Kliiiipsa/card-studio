import net from "node:net";
import tls from "node:tls";
import { AppError } from "@/lib/errors";

/**
 * Verification-code sender, no dependencies (npm install is unreliable here).
 * Transports, picked by env:
 *   - NOTISEND_API_KEY set → HTTPS API of NotiSend (api.notisend.ru, reserve
 *     host api-reserve.msndr.net). This is what prod uses: Timeweb App Platform
 *     blocks outgoing SMTP ports (25/465/587/2525) entirely, HTTPS/443 is open.
 *   - else SMTP_HOST/USER/PASS → raw SMTP; SMTP_SECURE=tls (implicit, 465) or
 *     starttls (587/2525). Kept for local dev and as a fallback.
 * MAIL_FROM is the sender for both (must be a verified sender in NotiSend).
 * When nothing is configured the register route falls back to a dev-mode code.
 */
export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.NOTISEND_API_KEY ||
      (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  );
}

const CODE_SUBJECT = (code: string) => `${code} — код подтверждения Kartogen`;
const CODE_TEXT = (code: string) =>
  `Ваш код подтверждения: ${code}\r\n\r\n` +
  `Код действует 15 минут. Если вы не регистрировались в Kartogen, просто проигнорируйте это письмо.\r\n`;
const CODE_HTML = (code: string) =>
  `<p style="font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1d1c19">Ваш код подтверждения:</p>` +
  `<p style="font:700 32px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:6px;color:#1d1c19">${code}</p>` +
  `<p style="font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#6e6a61">Код действует 15 минут. Если вы не регистрировались в Kartogen, просто проигнорируйте это письмо.</p>`;

/* ------------------------------ NotiSend API ------------------------------ */

const NOTISEND_HOSTS = ["https://api.notisend.ru/v1", "https://api-reserve.msndr.net/v1"];

/**
 * POST /email/messages. Tries the reserve host if the primary is unreachable
 * (their docs: use it when the primary is blocked/limited). Honors 429 with a
 * bounded wait — a rate-limited code must be delivered, not silently dropped.
 */
async function sendViaNotiSend(to: string, code: string): Promise<void> {
  const key = process.env.NOTISEND_API_KEY!;
  const from = process.env.MAIL_FROM || "admin@kartogen.ru";
  const body = JSON.stringify({
    from_email: from,
    from_name: "Kartogen",
    to,
    subject: CODE_SUBJECT(code),
    text: CODE_TEXT(code),
    html: CODE_HTML(code),
  });
  let lastErr: unknown = null;
  for (const host of NOTISEND_HOSTS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${host}/email/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body,
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        lastErr = e;
        break; // network-level failure → try the reserve host
      }
      if (res.ok) return;
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      if (res.status === 429) {
        const m = /(\d+)\s*seconds?/i.exec(detail);
        const wait = Math.min(Number(m?.[1] ?? 5), 20) * 1000;
        await new Promise((r) => setTimeout(r, wait));
        lastErr = new Error(`notisend 429: ${detail}`);
        continue;
      }
      // 4xx/5xx with a body — the reserve host won't help; surface the reason
      throw new Error(`notisend ${res.status}: ${detail}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "notisend unreachable"));
}

function b64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

/** Wire the SMTP dialogue: send a line, collect the (possibly multi-line) reply. */
class SmtpConn {
  private socket: net.Socket;
  private buffer = "";
  private waiter: ((reply: string) => void) | null = null;
  private failed: Error | null = null;

  constructor(socket: net.Socket) {
    this.socket = socket;
    this.attach(socket);
  }

  private attach(socket: net.Socket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.tryResolve();
    });
    const fail = (err: Error) => {
      this.failed = err;
      this.waiter?.(""); // wake the waiter; it will see `failed`
    };
    socket.on("error", fail);
    socket.on("close", () => fail(new Error("SMTP connection closed")));
  }

  /** STARTTLS: wrap the live plain socket in TLS and continue on the secure one. */
  upgrade(host: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const plain = this.socket;
      plain.removeAllListeners("data");
      plain.removeAllListeners("error");
      plain.removeAllListeners("close");
      const secure = tls.connect({ socket: plain, servername: host, timeout: 15000 }, () => {
        this.socket = secure;
        this.buffer = "";
        this.attach(secure);
        resolve();
      });
      secure.once("error", reject);
      secure.on("timeout", () => {
        secure.destroy();
        reject(new Error("STARTTLS handshake timeout"));
      });
    });
  }

  private tryResolve() {
    if (!this.waiter) return;
    // reply is complete when the last full line is "NNN " (space, not dash)
    const lines = this.buffer.split("\r\n").filter(Boolean);
    const last = lines[lines.length - 1];
    if (last && /^\d{3} /.test(last)) {
      const reply = this.buffer;
      this.buffer = "";
      const w = this.waiter;
      this.waiter = null;
      w(reply);
    }
  }

  readReply(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.failed) return reject(this.failed);
      this.waiter = (reply) => (this.failed ? reject(this.failed) : resolve(reply));
      this.tryResolve();
    });
  }

  async command(line: string, expectCode: string, secret = false): Promise<string> {
    this.socket.write(`${line}\r\n`);
    const reply = await this.readReply();
    if (!reply.startsWith(expectCode)) {
      throw new Error(`SMTP: "${secret ? "<credentials>" : line}" → ${reply.trim().slice(0, 200)}`);
    }
    return reply;
  }

  end() {
    this.socket.end();
  }
}

async function connect(host: string, port: number, implicitTls: boolean): Promise<SmtpConn> {
  return new Promise((resolve, reject) => {
    const onTimeout = (socket: net.Socket) => () => {
      socket.destroy();
      reject(new Error(`SMTP connect timeout (${implicitTls ? "tls" : "plain"} ${host}:${port})`));
    };
    if (implicitTls) {
      const socket = tls.connect({ host, port, servername: host, timeout: 15000 }, () =>
        resolve(new SmtpConn(socket)),
      );
      socket.on("timeout", onTimeout(socket));
      socket.once("error", reject);
    } else {
      const socket = net.connect({ host, port, timeout: 15000 }, () => resolve(new SmtpConn(socket)));
      socket.on("timeout", onTimeout(socket));
      socket.once("error", reject);
    }
  });
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  if (process.env.NOTISEND_API_KEY) {
    try {
      await sendViaNotiSend(to, code);
      return;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[mailer:notisend]", err);
      throw new AppError("Не удалось отправить письмо с кодом. Попробуйте позже.", 502);
    }
  }
  return sendViaSmtp(to, code);
}

/* --------------------------------- SMTP ---------------------------------- */

async function sendViaSmtp(to: string, code: string): Promise<void> {
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const startTls = (process.env.SMTP_SECURE ?? "tls").toLowerCase() === "starttls";
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;
  const from = process.env.MAIL_FROM || user;

  const subject = `=?UTF-8?B?${b64(CODE_SUBJECT(code))}?=`;
  const body = b64(CODE_TEXT(code));
  const message =
    `From: Kartogen <${from}>\r\n` +
    `To: <${to}>\r\n` +
    `Subject: ${subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `Content-Transfer-Encoding: base64\r\n` +
    `\r\n${body}`;

  let conn: SmtpConn | null = null;
  try {
    conn = await connect(host, port, !startTls);
    await conn.readReply(); // 220 greeting
    await conn.command(`EHLO kartogen.ru`, "250");
    if (startTls) {
      // never send credentials in the clear: require the upgrade to succeed
      await conn.command(`STARTTLS`, "220");
      await conn.upgrade(host);
      await conn.command(`EHLO kartogen.ru`, "250");
    }
    await conn.command(`AUTH LOGIN`, "334");
    await conn.command(b64(user), "334", true);
    await conn.command(b64(pass), "235", true);
    await conn.command(`MAIL FROM:<${from}>`, "250");
    await conn.command(`RCPT TO:<${to}>`, "250");
    await conn.command(`DATA`, "354");
    await conn.command(`${message}\r\n.`, "250");
    conn.end();
  } catch (err) {
    conn?.end();
    // eslint-disable-next-line no-console
    console.error("[mailer]", err);
    throw new AppError("Не удалось отправить письмо с кодом. Попробуйте позже.", 502);
  }
}
