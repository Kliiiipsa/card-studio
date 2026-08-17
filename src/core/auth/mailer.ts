import net from "node:net";
import tls from "node:tls";
import { AppError } from "@/lib/errors";

/**
 * Minimal SMTP sender — enough to deliver a verification code without adding
 * a dependency (npm install is unreliable in this environment). Two transports:
 *   - SMTP_SECURE=tls (default): implicit TLS from the first byte (port 465);
 *   - SMTP_SECURE=starttls: plain connect, then upgrade via STARTTLS (587/2525).
 * Timeweb's 465 endpoint accepts TCP but never completes the TLS handshake (as
 * of 2026-08), while 2525 answers and advertises STARTTLS — so prod uses that.
 * Env: SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS / MAIL_FROM.
 * When SMTP is not configured the register route falls back to a dev-mode code.
 */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
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
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const startTls = (process.env.SMTP_SECURE ?? "tls").toLowerCase() === "starttls";
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;
  const from = process.env.MAIL_FROM || user;

  const subject = `=?UTF-8?B?${b64("Код подтверждения — Kartogen")}?=`;
  const body = b64(
    `Ваш код подтверждения: ${code}\r\n\r\n` +
      `Код действует 15 минут. Если вы не регистрировались в Kartogen, просто проигнорируйте это письмо.\r\n`,
  );
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
