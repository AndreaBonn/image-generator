import { expect, test, type Page } from "@playwright/test";

/**
 * SPEC.md § 10.3: full E2E flow against the ENGINE_MODE=fake backend
 * (webServer in playwright.config.ts). Covers both mobile (375px) and
 * desktop (1280px) via Playwright projects. Steps are sequential by
 * nature (each depends on the previous one's data), so they live in a
 * single test instead of fabricating independent fixtures per step.
 */

const GENERATE_TIMEOUT = 15_000;

/** Extracts the generation id from an image URL like /api/v1/generations/<id>/image. */
function generationIdFromSrc(src: string): string {
  const match = src.match(/generations\/([0-9a-fA-F-]+)\//);
  if (!match) throw new Error(`Could not extract generation id from "${src}"`);
  return match[1];
}

/**
 * Locates one gallery card by generation id (via its thumbnail src), not by
 * prompt text: a rerun duplicates the source prompt, so a text-based locator
 * becomes ambiguous once both generations are in the gallery.
 */
function cardLocator(page: Page, generationId: string) {
  return page
    .locator(`img[src*="/generations/${generationId}/"]`)
    .locator("xpath=ancestor::button[1]");
}

async function drawMaskStroke(page: Page) {
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Mask canvas has no bounding box");
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  await page.mouse.move(centerX - 40, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX, centerY, { steps: 5 });
  await page.mouse.move(centerX + 40, centerY, { steps: 5 });
  await page.mouse.up();
}

test("crea -> galleria -> modifica -> rigenera -> elimina (SPEC § 10.3)", async ({
  page,
  request,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  const prompt = `e2e subject lighthouse ${Date.now()}`;

  await test.step("Crea: bozza veloce genera un'immagine", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "Bozza veloce" }).click();
    await page.getByLabel("Descrivi l'immagine che vuoi").fill(prompt);
    await page.getByRole("button", { name: "Genera", exact: true }).click();
    await expect(page.getByRole("link", { name: "Scarica" })).toBeVisible({
      timeout: GENERATE_TIMEOUT,
    });
  });

  const sourceImg = page.locator("img[alt='Immagine generata']").first();
  const sourceSrc = await sourceImg.getAttribute("src");
  if (!sourceSrc) throw new Error("Result image has no src");
  const sourceId = generationIdFromSrc(sourceSrc);

  await test.step("Galleria: la generazione compare, apri il dettaglio, preferito, chiudi con Escape", async () => {
    await page.goto("/galleria");
    const card = cardLocator(page, sourceId);
    await expect(card).toBeVisible({ timeout: GENERATE_TIMEOUT });
    await card.click();

    const dialog = page.getByRole("dialog", { name: "Dettaglio immagine" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Aggiungi ai preferiti" }).click();
    await expect(dialog.getByRole("button", { name: "Rimuovi dai preferiti" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  await test.step("Modifica dal dettaglio: maschera + prompt + genera", async () => {
    await cardLocator(page, sourceId).click();
    const dialog = page.getByRole("dialog", { name: "Dettaglio immagine" });
    await dialog.getByRole("link", { name: "Modifica" }).click();

    await expect(page).toHaveURL(new RegExp(`/modifica\\?source=${sourceId}`));
    // Modifica opens on "Modifica con le parole" (M5): switch to the mask editor.
    await page.getByRole("tab", { name: "Modifica una parte" }).click();
    await expect(page.locator("canvas")).toBeVisible();

    const generateButton = page.getByRole("button", { name: "Genera", exact: true });
    await expect(generateButton).toBeDisabled();

    await drawMaskStroke(page);
    await page.getByLabel("Descrizione").fill("a bright red lighthouse beacon");
    await expect(generateButton).toBeEnabled();
    await generateButton.click();

    await expect(page.getByRole("link", { name: "Scarica" })).toBeVisible({
      timeout: GENERATE_TIMEOUT,
    });
  });

  await test.step("Verifica via API: la nuova generazione ha parent_id = sorgente", async () => {
    const response = await request.get("/api/v1/generations?per_page=5");
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { data: { id: string; parent_id: string | null }[] };
    const newest = body.data[0];
    expect(newest.id).not.toBe(sourceId);
    expect(newest.parent_id).toBe(sourceId);
  });

  await test.step("Rigenera con nuovo seed dalla Galleria: nasce una generazione con seed diverso", async () => {
    const beforeDetail = await request.get(`/api/v1/generations/${sourceId}`);
    const beforeSeed = ((await beforeDetail.json()) as { data: { seed: number } }).data.seed;
    const beforeList = await request.get("/api/v1/generations?per_page=5");
    const beforeTotal = ((await beforeList.json()) as { meta: { total: number } }).meta.total;

    await page.goto("/galleria");
    await cardLocator(page, sourceId).click();
    const dialog = page.getByRole("dialog", { name: "Dettaglio immagine" });
    await dialog.getByRole("button", { name: "Un'altra variante" }).click();
    await expect(page.getByText(/Nuova variante in preparazione/)).toBeVisible();

    await expect
      .poll(
        async () => {
          const list = await request.get("/api/v1/generations?per_page=5");
          return ((await list.json()) as { meta: { total: number } }).meta.total;
        },
        { timeout: GENERATE_TIMEOUT, message: "attesa nuova generazione dal rigenera" },
      )
      .toBeGreaterThan(beforeTotal);

    const afterList = await request.get("/api/v1/generations?per_page=5");
    const afterBody = (await afterList.json()) as {
      data: { id: string; seed: number; parent_id: string | null }[];
    };
    const newest = afterBody.data[0];
    expect(newest.id).not.toBe(sourceId);
    expect(newest.seed).not.toBe(beforeSeed);

    await page.keyboard.press("Escape");
  });

  await test.step("Elimina dal dettaglio (due passi): la card sparisce", async () => {
    await page.goto("/galleria");
    const card = cardLocator(page, sourceId);
    await card.click();
    const dialog = page.getByRole("dialog", { name: "Dettaglio immagine" });

    await dialog.getByRole("button", { name: "Elimina", exact: true }).click();
    await expect(dialog.getByText("Eliminare questa immagine?")).toBeVisible();
    await dialog.getByRole("button", { name: "Sì, elimina" }).click();

    await expect(dialog).toBeHidden();
    await expect(card).toBeHidden();
  });

  expect(consoleErrors, `Console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
  expect(pageErrors, `Page errors: ${pageErrors.join(" | ")}`).toEqual([]);
});
