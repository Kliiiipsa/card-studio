import tls from "node:tls";
import { AppError } from "@/lib/errors";

/**
 * Minimal SMTP-over-TLS (port 465) sender — enough to deliver a verification
 * code through smtp.yandex.ru / smtp.mail.ru without adding a dependency
 * (npm install is unreliable in this environment). Env:
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM (optional).
 * When SMTP is not configured the register route falls back to a dev-mode
 * code (local testing without a mailbox).
 */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function b64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

/** Wire the SMTP dialogue: send a line, collect the (possibly multi-line) reply. */
class SmtpConn {
  private socket: tls.TLSSocket;
  private buffer = "";
  private waiter: ((reply: string) => void) | null = null;
  private failed: Error | null = null;

  constructor(socket: tls.TLSSocket) {
    this.socket = socket;
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

async function connect(host: string, port: number): Promise<SmtpConn> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, timeout: 15000 }, () =>
      resolve(new SmtpConn(socket)),
    );
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("SMTP connect timeout"));
    });
    socket.once("error", reject);
  });
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;
  const from = process.env.MAIL_FROM || user;

  const subject = `=?UTF-8?B?${b64("Код подтверждения — Nevario")}?=`;
  const body = b64(
    `Ваш код подтверждения: ${code}\r\n\r\n` +
      `Код действует 15 минут. Если вы не регистрировались в Nevario, просто проигнорируйте это письмо.\r\n`,
  );
  const message =
    `From: Nevario <${from}>\r\n` +
    `To: <${to}>\r\n` +
    `Subject: ${subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `Content-Transfer-Encoding: base64\r\n` +
    `\r\n${body}`;

  let conn: SmtpConn | null = null;
  try {
    conn = await connect(host, port);
    await conn.readReply(); // 220 greeting
    await conn.command(`EHLO wb-card-studio`, "250");
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
