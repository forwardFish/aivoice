import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
const args = process.argv.slice(2);
const argValue = (name, fallback = "") => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
};
const projectRoot = path.resolve(argValue("project-root", "."));
const baseArg = argValue("base-url", process.env.AUTO_EXECUTE_API_BASE_URL || process.env.AUTO_EXECUTE_UI_BASE_URL || "http://127.0.0.1:3000");
const materializedPath = path.join(projectRoot, "docs", "auto-execute", "story-materialized-tests.json");
const outPath = path.join(projectRoot, "docs", "auto-execute", "results", "api-smoke.generated.json");
const materialized = JSON.parse(fs.readFileSync(materializedPath, "utf8").replace(/^\uFEFF/, ""));
const apiPoints = materialized.stories.flatMap((story) => (story.testPoints || []).map((tp) => ({ storyId: story.storyId, ...tp }))).filter((tp) => tp.type === "api");
function requestStatus(url, method = "GET") {
  return new Promise((resolve) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.request(url, { method, timeout: 10000 }, (response) => {
      response.resume();
      response.on("end", () => resolve({ statusCode: response.statusCode, pass: response.statusCode < 500 }));
    });
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", (error) => resolve({ pass: false, error: error.message }));
    req.end();
  });
}
const results = [];
for (const tp of apiPoints) {
  const raw = String(tp.target || "");
  const match = raw.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i);
  const method = match ? match[1].toUpperCase() : "GET";
  const route = match ? match[2] : raw;
  const url = route.startsWith("http") ? route : new URL(route || "/", baseArg).toString();
  const result = await requestStatus(url, method);
  results.push({ storyId: tp.storyId, testPointId: tp.testPointId, target: raw, method, url, ...result });
}
const pass = results.length > 0 && results.every((r) => r.pass);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ schemaVersion: "1.9.1", lane: "api-smoke-generated", status: pass ? "PASS" : "HARD_FAIL", generatedAt: new Date().toISOString(), results }, null, 2));
process.exit(pass ? 0 : 1);
