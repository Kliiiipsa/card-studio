// Deploy relay/api/*.js to the Vercel project kartogen-tg-relay via REST API.
// Usage: node relay/deploy.mjs   (VERCEL_TOKEN from .env; npm/npx are broken here)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..");
const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
const TOKEN = env.match(/^VERCEL_TOKEN=(.*)$/m)?.[1]?.trim();
if (!TOKEN) throw new Error("VERCEL_TOKEN missing in .env");
const TEAM = "team_HQ1GwHz4R3ji4dk9wWp3VJ46";
const PROJECT = "kartogen-tg-relay";
const auth = { Authorization: `Bearer ${TOKEN}` };

const dir = path.join(ROOT, "relay", "api");
const files = [];
for (const name of fs.readdirSync(dir)) {
  const bytes = fs.readFileSync(path.join(dir, name));
  const sha = crypto.createHash("sha1").update(bytes).digest("hex");
  const up = await fetch(`https://api.vercel.com/v2/files?teamId=${TEAM}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/octet-stream", "x-vercel-digest": sha },
    body: bytes,
  });
  if (!up.ok) throw new Error(`upload ${name}: ${up.status} ${await up.text()}`);
  files.push({ file: `api/${name}`, sha, size: bytes.length });
  console.log("uploaded", name, bytes.length);
}

const dep = await fetch(`https://api.vercel.com/v13/deployments?teamId=${TEAM}`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ name: PROJECT, project: PROJECT, target: "production", files, projectSettings: { framework: null } }),
});
const d = await dep.json();
if (!dep.ok) throw new Error(`deploy: ${dep.status} ${JSON.stringify(d).slice(0, 500)}`);
console.log("deployment", d.id, d.readyState, d.url);
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await (await fetch(`https://api.vercel.com/v13/deployments/${d.id}?teamId=${TEAM}`, { headers: auth })).json();
  console.log("  ", s.readyState);
  if (s.readyState === "READY") break;
  if (s.readyState === "ERROR" || s.readyState === "CANCELED") throw new Error("deploy failed: " + JSON.stringify(s).slice(0, 500));
}
