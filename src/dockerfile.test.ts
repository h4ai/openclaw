import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const dockerfilePath = join(repoRoot, "Dockerfile");

describe("Dockerfile", () => {
  it("uses shared Playwright base image ref for all root stages", async () => {
    const dockerfile = await readFile(dockerfilePath, "utf8");
    expect(dockerfile).toContain(
      'ARG OPENCLAW_BASE_IMAGE="mcr.microsoft.com/playwright:v1.50.0-noble"',
    );
    expect(dockerfile).toContain("FROM ${OPENCLAW_BASE_IMAGE} AS ext-deps");
    expect(dockerfile).toContain("FROM ${OPENCLAW_BASE_IMAGE} AS build");
    expect(dockerfile).toContain("FROM ${OPENCLAW_BASE_IMAGE} AS base-runtime");
  });

  it("installs Node.js 24 via NodeSource in both build and runtime stages", async () => {
    const dockerfile = await readFile(dockerfilePath, "utf8");
    const nodeSourceOccurrences = dockerfile.split("setup_24.x").length - 1;
    expect(nodeSourceOccurrences).toBe(2);
    expect(dockerfile).toContain("node -v && npm -v && npx playwright --version");
  });

  it("retains OPENCLAW_INSTALL_BROWSER arg for compatibility (no-op with Playwright base)", async () => {
    const dockerfile = await readFile(dockerfilePath, "utf8");
    const browserArgIndex = dockerfile.indexOf("ARG OPENCLAW_INSTALL_BROWSER");
    expect(browserArgIndex).toBeGreaterThan(-1);
    // Playwright browsers are pre-installed; no separate install step needed.
    expect(dockerfile).toContain("Playwright browsers are already included");
  });

  it("prunes runtime dependencies after the build stage", async () => {
    const dockerfile = await readFile(dockerfilePath, "utf8");
    expect(dockerfile).toContain("FROM build AS runtime-assets");
    expect(dockerfile).toContain("CI=true pnpm prune --prod");
    expect(dockerfile).toContain(
      "COPY --from=runtime-assets --chown=node:node /app/node_modules ./node_modules",
    );
  });

  it("normalizes plugin and agent paths permissions in image layers", async () => {
    const dockerfile = await readFile(dockerfilePath, "utf8");
    expect(dockerfile).toContain("for dir in /app/extensions /app/.agent /app/.agents");
    expect(dockerfile).toContain('find "$dir" -type d -exec chmod 755 {} +');
    expect(dockerfile).toContain('find "$dir" -type f -exec chmod 644 {} +');
  });

  it("Docker GPG fingerprint awk uses correct quoting for OPENCLAW_SANDBOX=1 build", async () => {
    const dockerfile = await readFile(dockerfilePath, "utf8");
    expect(dockerfile).toContain('== "fpr" {');
    expect(dockerfile).not.toContain('\\"fpr\\"');
  });

  it("keeps runtime pnpm available", async () => {
    const dockerfile = await readFile(dockerfilePath, "utf8");
    expect(dockerfile).toContain("ENV COREPACK_HOME=/usr/local/share/corepack");
    expect(dockerfile).toContain(
      'corepack prepare "$(node -p "require(\'./package.json\').packageManager")" --activate',
    );
  });
});
