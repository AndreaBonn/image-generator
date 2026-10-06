import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Tailwind v4 resolves `max-w-<size>` from `--spacing-<size>` before `--container-<size>`,
// so a named spacing token silently turns `max-w-sm` into `max-width: 0.5rem` and squeezes
// every dialog that uses it to one word per line.
const SHADOWING_SPACING_TOKEN = /--spacing-(?:3xs|2xs|xs|sm|md|lg|xl|[2-7]xl)\s*:/;

describe("theme tokens", () => {
  it("does not define named spacing tokens that shadow the container scale", () => {
    const css = readFileSync(resolve(__dirname, "../src/index.css"), "utf-8");

    expect(css).not.toMatch(SHADOWING_SPACING_TOKEN);
  });

  it("detects a shadowing spacing token when one is present", () => {
    expect("  --spacing-sm: 0.5rem;").toMatch(SHADOWING_SPACING_TOKEN);
  });
});
