#!/usr/bin/env node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs = require("fs");
const path = require("path");

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

function resolveProjectPath(root, value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(root, value);
}

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function existingActual(screen) {
  return screen.actualScreenshot || screen.actualScreenshotDesktop || screen.visualEvidence || screen.actual || "";
}

function cropPng(png, width, height) {
  if (png.width === width && png.height === height) return png;
  const cropped = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sourceStart = (y * png.width) * 4;
    const targetStart = (y * width) * 4;
    png.data.copy(cropped.data, targetStart, sourceStart, sourceStart + width * 4);
  }
  return cropped;
}

async function main() {
  const projectRoot = path.resolve(arg("project-root", process.cwd()));
  const docsRoot = path.join(projectRoot, "docs", "auto-execute");
  const uiTargetPath = path.join(docsRoot, "ui-target.json");
  const diffDir = path.join(docsRoot, "screenshots", "diffs");
  const resultPath = path.join(docsRoot, "results", "ui-pixel-diff.json");
  const reportPath = path.join(docsRoot, "visual-diff-report.md");
  const threshold = Number(arg("threshold", "0.03"));
  const strict = arg("strict", "false") === "true";
  const result = {
    schemaVersion: "2.0",
    lane: "ui-pixel-diff",
    status: "MANUAL_REVIEW_REQUIRED",
    mappingPriority: ["harness.yml uiMapping", "UIReferences auto discovery", "filename route guess", "manual review"],
    threshold,
    strict,
    comparisons: [],
    blockers: [],
    updatedAt: new Date().toISOString(),
  };

  let pixelmatch;
  let PNG;
  try {
    pixelmatch = require("pixelmatch");
    if (pixelmatch && pixelmatch.default) pixelmatch = pixelmatch.default;
    PNG = require("pngjs").PNG;
  } catch {
    result.blockers.push("pixelmatch/pngjs are not installed. Automated visual diff cannot run.");
    result.nextActions = ["Allow dev dependency installation or keep pixelPerfectStatus as MANUAL_REVIEW_REQUIRED."];
    writeJson(resultPath, result);
    writeJson(reportPath.replace(/\.md$/, ".json"), result);
    fs.writeFileSync(reportPath, `# Visual Diff Report\n\n- Status: ${result.status}\n- Reason: pixelmatch/pngjs unavailable\n`, "utf8");
    process.exit(3);
  }

  const uiTarget = readJson(uiTargetPath, { schemaVersion: "2.0", screens: [] });
  const screens = Array.isArray(uiTarget.screens) ? uiTarget.screens : [];
  ensureDir(diffDir);
  let hardFail = false;
  let compared = 0;
  for (const screen of screens) {
    if (!screen || screen.required === false) continue;
    const id = String(screen.id || `UI-${compared + 1}`).replace(/[^a-zA-Z0-9_-]/g, "_");
    const reference = resolveProjectPath(projectRoot, screen.reference || screen.referencePath || screen.uiReference || "");
    const actual = resolveProjectPath(projectRoot, existingActual(screen));
    if (!reference || !fs.existsSync(reference)) {
      result.comparisons.push({ id, status: "MANUAL_REVIEW_REQUIRED", reason: "reference missing" });
      continue;
    }
    if (!actual || !fs.existsSync(actual)) {
      result.comparisons.push({ id, status: "HARD_FAIL", reason: "actual screenshot missing" });
      hardFail = true;
      continue;
    }
    if (path.extname(reference).toLowerCase() !== ".png" || path.extname(actual).toLowerCase() !== ".png") {
      result.comparisons.push({ id, status: "MANUAL_REVIEW_REQUIRED", reason: "pixel diff supports PNG references and screenshots only" });
      continue;
    }
    const refPng = PNG.sync.read(fs.readFileSync(reference));
    const actualPng = PNG.sync.read(fs.readFileSync(actual));
    const width = Math.min(refPng.width, actualPng.width);
    const height = Math.min(refPng.height, actualPng.height);
    const sizeMismatch = refPng.width !== actualPng.width || refPng.height !== actualPng.height;
    const refForDiff = cropPng(refPng, width, height);
    const actualForDiff = cropPng(actualPng, width, height);
    const diff = new PNG({ width, height });
    const mismatch = pixelmatch(refForDiff.data, actualForDiff.data, diff.data, width, height, { threshold: 0.1 });
    const ratio = mismatch / (width * height);
    const diffPath = path.join(diffDir, `${id}-diff.png`);
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    const relDiff = toRel(projectRoot, diffPath);
    screen.visualDiffEvidence = relDiff;
    screen.visualDiff = relDiff;
    screen.pixelDiffRatio = ratio;
    screen.pixelDiffComparedSize = `${width}x${height}`;
    if (sizeMismatch) {
      screen.pixelDiffSizeMismatch = true;
      screen.pixelDiffReferenceSize = `${refPng.width}x${refPng.height}`;
      screen.pixelDiffActualSize = `${actualPng.width}x${actualPng.height}`;
    }
    if (ratio <= threshold && !sizeMismatch) {
      screen.pixelPerfectStatus = "PASS";
      screen.visualStatus = "PASS";
      if (screen.structureStatus === "PENDING") screen.structureStatus = "PASS";
      if (screen.status !== "HARD_FAIL") screen.status = "PASS";
      result.comparisons.push({ id, status: "PASS", ratio, diff: relDiff, comparedSize: `${width}x${height}` });
    } else {
      screen.pixelPerfectStatus = "MANUAL_REVIEW_REQUIRED";
      screen.visualStatus = "PASS_WITH_LIMITATION";
      if (screen.status !== "HARD_FAIL") screen.status = "PASS_WITH_LIMITATION";
      const status = screen.pixelPerfectRequired === true || strict ? "HARD_FAIL" : "PASS_WITH_LIMITATION";
      if (status === "HARD_FAIL") hardFail = true;
      result.comparisons.push({
        id,
        status,
        ratio,
        diff: relDiff,
        comparedSize: `${width}x${height}`,
        sizeMismatch,
        referenceSize: `${refPng.width}x${refPng.height}`,
        actualSize: `${actualPng.width}x${actualPng.height}`,
        reason: sizeMismatch && ratio <= threshold ? "image dimensions differ; pixel-perfect pass is not allowed" : undefined,
      });
    }
    compared++;
  }

  uiTarget.screens = screens;
  uiTarget.mappingPriority = ["harness.yml uiMapping", "UIReferences auto discovery", "filename route guess", "manual review"];
  uiTarget.updatedAt = new Date().toISOString();
  writeJson(uiTargetPath, uiTarget);
  if (hardFail) result.status = "HARD_FAIL";
  else if (compared === 0) result.status = "MANUAL_REVIEW_REQUIRED";
  else if (result.comparisons.some((item) => item.status !== "PASS")) result.status = "PASS_NEEDS_MANUAL_UI_REVIEW";
  else result.status = "PASS";
  const report = [
    "# Visual Diff Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `- Status: ${result.status}`,
    `- Threshold: ${threshold}`,
    "",
    "## Comparisons",
    ...(result.comparisons.length
      ? result.comparisons.map((item) => `- ${item.id}: ${item.status}${typeof item.ratio === "number" ? ` ratio=${item.ratio}` : ""}${item.diff ? ` diff=${item.diff}` : ""}${item.reason ? ` reason=${item.reason}` : ""}`)
      : ["- None"]),
    "",
  ].join("\n");
  writeJson(resultPath, result);
  fs.writeFileSync(reportPath, report, "utf8");
  process.exit(result.status === "HARD_FAIL" ? 1 : result.status === "PASS" ? 0 : 3);
}

main().catch((err) => {
  const projectRoot = path.resolve(arg("project-root", process.cwd()));
  const resultPath = path.join(projectRoot, "docs", "auto-execute", "results", "ui-pixel-diff.json");
  writeJson(resultPath, {
    schemaVersion: "2.0",
    lane: "ui-pixel-diff",
    status: "HARD_FAIL",
    error: err.message,
    updatedAt: new Date().toISOString(),
  });
  process.exit(1);
});
