#!/usr/bin/env node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function arg(name, fallback = "") {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return process.env[`AE_${name.replace(/-/g, "_").toUpperCase()}`] || fallback;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function inferRouteV191(reference = "", id = "") {
  const text = `${reference} ${id}`.toLowerCase();
  if (/home|index|首页|landing/.test(text)) return "/";
  if (/dashboard|工作台/.test(text)) return "/dashboard";
  if (/copilot/.test(text)) return "/copilot";
  if (/archive|历史|归档/.test(text)) return "/archive";
  if (/pricing|price|价格|付费/.test(text)) return "/pricing";
  if (/report|报告/.test(text)) return "/report";
  if (/upload|上传/.test(text)) return "/dashboard/upload";
  if (/settings|设置/.test(text)) return "/settings";
  return "/";
}

function inferRoute(reference = "", id = "") {
  const text = `${reference} ${id}`.toLowerCase();
  if (/home|index|\u9996\u9875|landing/.test(text)) return "/";
  if (/dashboard|\u5de5\u4f5c\u53f0|\u4eea\u8868\u76d8/.test(text)) return "/dashboard";
  if (/copilot/.test(text)) return "/copilot";
  if (/archive|\u5386\u53f2|\u5f52\u6863/.test(text)) return "/archive";
  if (/pricing|price|\u4ef7\u683c|\u4ed8\u8d39/.test(text)) return "/pricing";
  if (/report|\u62a5\u544a/.test(text)) return "/report";
  if (/upload|\u4e0a\u4f20/.test(text)) return "/dashboard/upload";
  if (/settings|\u8bbe\u7f6e/.test(text)) return "/settings";
  return "/";
}

function normalizeScreens(projectRoot, uiTarget, uiCandidates) {
  let screens = Array.isArray(uiTarget.screens) ? uiTarget.screens : [];
  if (screens.length === 0 && Array.isArray(uiCandidates.candidates)) {
    screens = uiCandidates.candidates.map((candidate, index) => ({
      id: candidate.id || `UI-${String(index + 1).padStart(3, "0")}`,
      route: inferRoute(candidate.reference, candidate.id),
      reference: candidate.reference,
      required: true,
      status: "PENDING",
      structureStatus: "PENDING",
      visualStatus: "PENDING",
      pixelPerfectStatus: "MANUAL_REVIEW_REQUIRED",
      mappingSource: "UIReferences auto discovery",
      routeMappingSource: "filename guess",
    }));
  }
  return screens.map((screen, index) => {
    const id = screen.id || `UI-${String(index + 1).padStart(3, "0")}`;
    const explicitRoute = Boolean(screen.route);
    return {
      ...screen,
      id,
      route: screen.route || inferRoute(screen.reference || screen.referencePath || screen.uiReference || "", id),
      mappingSource: screen.mappingSource || (explicitRoute ? "manual review" : "filename guess"),
      routeMappingSource: screen.routeMappingSource || (explicitRoute ? "explicit route" : "filename guess"),
      required: screen.required !== false,
    };
  });
}

async function waitForUrl(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.status < 500) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function captureScreen({ playwright, projectRoot, docsRoot, screenshotDir, baseUrl, timeoutMs, screen, viewport }) {
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const consoleErrors = [];
  const runtimeErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => runtimeErrors.push(err.message));
  const route = screen.route || "/";
  const url = route.startsWith("http") ? route : `${baseUrl}${route.startsWith("/") ? "" : "/"}${route}`;
  const cleanId = String(screen.id).replace(/[^a-zA-Z0-9_-]/g, "_");
  const screenshotPath = path.join(screenshotDir, `${cleanId}-${viewport.name}.png`);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
    const pageHealth = await page.evaluate(() => {
      const body = document.body;
      const text = body ? body.innerText.trim() : "";
      const visibleElements = Array.from(document.querySelectorAll("body *")).filter((el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      }).length;
      const frameworkError = Boolean(
        document.querySelector("[data-nextjs-dialog], nextjs-portal, vite-error-overlay, #webpack-dev-server-client-overlay")
      );
      return { textLength: text.length, visibleElements, frameworkError, title: document.title };
    });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const blank = pageHealth.textLength < 3 && pageHealth.visibleElements < 3;
    const hasRuntimeError = pageHealth.frameworkError || runtimeErrors.length > 0;
    return {
      id: screen.id,
      route,
      url,
      viewport: viewport.name,
      screenshot: toRel(projectRoot, screenshotPath),
      status: blank || hasRuntimeError ? "HARD_FAIL" : "PASS",
      blank,
      runtimeErrors,
      consoleErrors: consoleErrors.slice(0, 10),
      pageHealth,
    };
  } catch (err) {
    return {
      id: screen.id,
      route,
      url,
      viewport: viewport.name,
      status: "HARD_FAIL",
      error: err.message,
    };
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function main() {
  const projectRoot = path.resolve(arg("project-root", process.cwd()));
  const docsRoot = path.join(projectRoot, "docs", "auto-execute");
  const uiTargetPath = path.join(docsRoot, "ui-target.json");
  const uiCandidatesPath = path.join(docsRoot, "ui-candidates.json");
  const resultPath = path.join(docsRoot, "results", "ui-capture.json");
  const screenshotDir = path.join(docsRoot, "screenshots");
  const baseUrl = arg("base-url", "http://127.0.0.1:3000").replace(/\/$/, "");
  const startCommand = arg("start-command", "");
  const timeoutMs = Number(arg("timeout-ms", "45000"));
  const viewports = [
    { name: "desktop", width: 1536, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ];

  const result = {
    schemaVersion: "2.0",
    lane: "ui-capture",
    status: "MANUAL_REVIEW_REQUIRED",
    mappingPriority: ["harness.yml uiMapping", "UIReferences auto discovery", "filename route guess", "manual review"],
    baseUrl,
    viewports: viewports.map((v) => `${v.name}:${v.width}x${v.height}`),
    startedAt: new Date().toISOString(),
    screenshots: [],
    blockers: [],
    nextActions: [],
  };

  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    result.blockers.push("Playwright is not installed or not resolvable from this project.");
    result.nextActions.push("Allow dev dependency installation or configure commands.uiCapture.");
    writeJson(resultPath, result);
    process.exit(3);
  }

  const uiTarget = readJson(uiTargetPath, { schemaVersion: "2.0", screens: [] });
  const uiCandidates = readJson(uiCandidatesPath, { schemaVersion: "2.0", candidates: [] });
  const screens = normalizeScreens(projectRoot, uiTarget, uiCandidates);
  const requiredScreens = screens.filter((screen) => screen.required !== false);
  if (requiredScreens.length === 0) {
    result.blockers.push("No required UI screens are available in ui-target.json or ui-candidates.json.");
    result.nextActions.push("Map UI references to ui-target.json with id, route, reference, and required fields.");
    writeJson(resultPath, result);
    process.exit(3);
  }

  let serverProcess = null;
  if (startCommand) {
    const logFile = path.join(docsRoot, "logs", "ui-capture-server.log");
    ensureDir(path.dirname(logFile));
    serverProcess = spawn(startCommand, { cwd: projectRoot, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    const log = fs.createWriteStream(logFile, { flags: "a" });
    serverProcess.stdout.pipe(log);
    serverProcess.stderr.pipe(log);
  }

  try {
    const reachable = await waitForUrl(baseUrl, timeoutMs);
    if (!reachable) {
      result.status = "DOCUMENTED_BLOCKER";
      result.blockers.push(`Base URL did not become reachable within ${timeoutMs} ms: ${baseUrl}`);
      result.nextActions.push("Start the local app or set commands.uiStart / commands.uiBaseUrl in harness.yml.");
      writeJson(resultPath, result);
      process.exit(4);
    }

    ensureDir(screenshotDir);
    for (const screen of requiredScreens) {
      const captures = [];
      for (const viewport of viewports) {
        const capture = await captureScreen({ playwright, projectRoot, docsRoot, screenshotDir, baseUrl, timeoutMs, screen, viewport });
        captures.push(capture);
        result.screenshots.push(capture);
        if (capture.status === "PASS") {
          if (viewport.name === "desktop") {
            screen.actualScreenshot = capture.screenshot;
            screen.actualScreenshotDesktop = capture.screenshot;
          }
          if (viewport.name === "mobile") screen.actualScreenshotMobile = capture.screenshot;
        }
      }
      const failed = captures.filter((item) => item.status !== "PASS");
      if (failed.length > 0) {
        screen.captureStatus = "HARD_FAIL";
        screen.status = "HARD_FAIL";
        screen.structureStatus = "HARD_FAIL";
        result.blockers.push(`UI screen ${screen.id} failed screenshot capture for ${failed.map((f) => f.viewport).join(", ")}.`);
      } else {
        screen.captureStatus = "PASS";
        screen.structureStatus = screen.structureStatus === "PASS" ? "PASS" : "PASS";
        screen.visualStatus = screen.visualStatus === "PASS" ? "PASS" : "PASS_WITH_LIMITATION";
        screen.pixelPerfectStatus = screen.pixelPerfectStatus || "MANUAL_REVIEW_REQUIRED";
        screen.status = screen.status === "PASS" ? "PASS" : "PASS_WITH_LIMITATION";
        screen.visualEvidence = screen.actualScreenshot;
      }
    }
    uiTarget.schemaVersion = "2.0";
    uiTarget.mappingPriority = ["harness.yml uiMapping", "UIReferences auto discovery", "filename route guess", "manual review"];
    uiTarget.screens = screens;
    uiTarget.updatedAt = new Date().toISOString();
    writeJson(uiTargetPath, uiTarget);
    result.status = result.blockers.length > 0 ? "HARD_FAIL" : "PASS";
    result.nextActions.push("Run run-ui-compare.ps1 for visual diff and final UI verifier status.");
    writeJson(resultPath, result);
    process.exit(result.status === "HARD_FAIL" ? 1 : 0);
  } finally {
    if (serverProcess && !serverProcess.killed) {
      try {
        serverProcess.kill();
      } catch {}
    }
  }
}

main().catch((err) => {
  const projectRoot = path.resolve(arg("project-root", process.cwd()));
  const resultPath = path.join(projectRoot, "docs", "auto-execute", "results", "ui-capture.json");
  writeJson(resultPath, {
    schemaVersion: "2.0",
    lane: "ui-capture",
    status: "HARD_FAIL",
    error: err.message,
    updatedAt: new Date().toISOString(),
  });
  process.exit(1);
});
