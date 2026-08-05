import { createHash, createHmac } from "node:crypto";

/**
 * Minimal S3 client (PUT + public URL) for Timeweb S3 — AWS Signature V4,
 * path-style, no SDK dependency. Env: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY,
 * S3_SECRET_KEY (S3_REGION optional, Timeweb uses "ru-1").
 */
export function s3Enabled(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY &&
      process.env.S3_SECRET_KEY,
  );
}

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

/** Upload a buffer; returns the public object URL. */
export async function s3Put(key: string, body: Buffer, contentType: string): Promise<string> {
  const endpoint = process.env.S3_ENDPOINT!.replace(/\/$/, "");
  const bucket = process.env.S3_BUCKET!;
  const accessKey = process.env.S3_ACCESS_KEY!;
  const secretKey = process.env.S3_SECRET_KEY!;
  const region = process.env.S3_REGION || "ru-1";

  const host = new URL(endpoint).host;
  const path = `/${bucket}/${key}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);

  const headers: Record<string, string> = {
    host,
    "content-type": contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((h) => `${h}:${headers[h]}\n`)
    .join("");
  const canonicalRequest = ["PUT", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const res = await fetch(`${endpoint}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`S3 PUT failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return `${endpoint}${path}`;
}

/** Download a remote image (e.g. a temporary fal URL) and persist it to S3. */
export async function persistImageToS3(
  sourceUrl: string,
  key: string,
): Promise<{ url: string; bytes: number; contentType: string }> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`image download failed: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "image/png";
  const body = Buffer.from(await res.arrayBuffer());
  const url = await s3Put(key, body, contentType);
  return { url, bytes: body.length, contentType };
}
