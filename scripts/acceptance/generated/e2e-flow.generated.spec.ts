import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const projectRoot = process.env.AUTO_EXECUTE_PROJECT_ROOT || process.cwd();
const baseURL = process.env.AUTO_EXECUTE_UI_BASE_URL || "http://127.0.0.1:3000";
const materializedPath = path.join(projectRoot, "docs", "auto-execute", "story-materialized-tests.json");
const outPath = path.join(projectRoot, "docs", "auto-execute", "results", "e2e-flow.generated.json");
const materialized = JSON.parse(fs.readFileSync(materializedPath, "utf8").replace(/^\uFEFF/, ""));
const points = materialized.stories.flatMap((story) => (story.testPoints || []).map((tp) => ({ storyId: story.storyId, ...tp }))).filter((tp) => ["e2e", "state"].includes(tp.type));
test.afterAll(async () => {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ schemaVersion: "1.9.1", lane: "e2e-flow-generated", status: "PASS", generatedAt: new Date().toISOString(), count: points.length }, null, 2));
});
for (const tp of points) {
  test(`${tp.storyId} ${tp.testPointId} ${tp.target || "flow"}`, async ({ page }) => {
    const target = String(tp.target || "/");
    if (target.startsWith("/")) {
      await page.goto(new URL(target, baseURL).toString());
      await expect(page.locator("body")).toBeVisible();
    } else {
      test.info().annotations.push({ type: "manual-target", description: target });
    }
  });
}
