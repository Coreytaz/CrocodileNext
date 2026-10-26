import { test, expect, type Browser, type Page } from "@playwright/test";

async function createRoom(page: Page) {
  await page.goto("/");
  await page.getByLabel("Ваш ник").fill("Художник");
  await page
    .getByRole("button", { name: "Создать комнату", exact: true })
    .click();
  await expect(page).toHaveURL(/\/game\/[A-F0-9]{8}$/);
  await expect(
    page.getByRole("dialog", { name: "Выбор слова", exact: true }),
  ).toBeVisible();
  return page.url();
}
async function joinRoom(
  browser: Browser,
  url: string,
  name: string,
  mobile = false,
) {
  const context = await browser.newContext(
    mobile
      ? {
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        }
      : {},
  );
  const page = await context.newPage();
  await page.goto(url);
  await page.getByLabel("Ваш ник").fill(name);
  await page
    .getByRole("button", { name: "Войти в комнату", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Догадки и разговоры" }),
  ).toBeVisible();
  return { page, context };
}
async function dismissResult(page: Page) {
  const result = page.getByRole("dialog", {
    name: "Итоги раунда",
    exact: true,
  });
  if (await result.isVisible()) await result.getByRole("button").click();
}
async function chooseWord(page: Page) {
  await dismissResult(page);
  const choices = page
    .getByRole("dialog", { name: "Выбор слова", exact: true })
    .locator(".word-picker")
    .getByRole("button");
  await expect(choices).toHaveCount(3);
  const word = (await choices.first().innerText()).trim();
  await choices.first().click();
  await expect(
    page.getByRole("button", { name: "Кисть", exact: true }),
  ).toBeEnabled();
  return word;
}
async function canvasHash(page: Page) {
  return page
    .locator("canvas")
    .evaluate((node: HTMLCanvasElement) => node.toDataURL());
}
async function draw(
  page: Page,
  start: [number, number],
  end: [number, number],
) {
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(
    box.x + (start[0] * box.width) / 1200,
    box.y + (start[1] * box.height) / 800,
  );
  await page.mouse.down();
  await page.mouse.move(
    box.x + (end[0] * box.width) / 1200,
    box.y + (end[1] * box.height) / 800,
    { steps: 16 },
  );
  await page.mouse.up();
  await expect(page.getByRole("button", { name: /Отменить/u })).toBeEnabled();
}
async function send(page: Page, text: string) {
  await page.getByLabel("Сообщение", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(page.getByLabel("Сообщение", { exact: true })).toHaveValue("");
}

test("three players: live drawing, every tool, history, guesses and manual controls", async ({
  page: host,
  browser,
}, testInfo) => {
  const errors: string[] = [];
  host.on("pageerror", (error) => errors.push(error.message));
  const url = await createRoom(host);
  const viewer = await joinRoom(browser, url, "Угадайка");
  const friend = await joinRoom(browser, url, "Друг");
  try {
    await expect(host.locator(".tool-button").first()).toBeDisabled();
    const initialBlank = await canvasHash(host);
    await host.keyboard.press("Escape");
    await expect(
      host.getByRole("dialog", { name: "Выбор слова" }),
    ).toBeVisible();
    const firstChoice = host
      .getByRole("dialog", { name: "Выбор слова" })
      .locator(".word-picker button")
      .first();
    await firstChoice.focus();
    await host.keyboard.press("Shift+Tab");
    await expect(
      host.getByRole("button", { name: "Выйти из комнаты", exact: true }),
    ).toBeFocused();
    await host.keyboard.press("Tab");
    await expect(firstChoice).toBeFocused();
    expect(await canvasHash(host)).toBe(initialBlank);
    const word = await chooseWord(host);
    await expect(
      viewer.page.getByText("Художник рисует…", { exact: true }),
    ).toBeVisible();
    await expect(viewer.page.getByLabel("Выбор слова")).toHaveCount(0);
    await expect(
      viewer.page.getByRole("button", { name: "Кисть", exact: true }),
    ).toHaveCount(0);
    const blank = await canvasHash(host);
    const box = (await host.locator("canvas").boundingBox())!;
    await host.mouse.move(
      box.x + (50 * box.width) / 1200,
      box.y + (50 * box.height) / 800,
    );
    await host.mouse.down();
    await host.mouse.move(
      box.x + (210 * box.width) / 1200,
      box.y + (180 * box.height) / 800,
      { steps: 20 },
    );
    // Other players see the stroke while the pointer is still held down.
    await expect.poll(() => canvasHash(viewer.page)).not.toBe(blank);
    await host.mouse.up();
    await expect(host.getByRole("button", { name: /Отменить/u })).toBeEnabled();
    await expect
      .poll(() => canvasHash(viewer.page))
      .toBe(await canvasHash(host));
    for (const tool of ["Ластик", "Линия", "Прямоугольник", "Круг"]) {
      await host.getByRole("button", { name: tool, exact: true }).click();
      await draw(
        host,
        tool === "Ластик" ? [50, 50] : [350, 230],
        tool === "Ластик" ? [100, 90] : [650, 430],
      );
      await expect
        .poll(() => canvasHash(viewer.page))
        .toBe(await canvasHash(host));
    }
    await host
      .getByRole("button", { name: "Цвет #f97316", exact: true })
      .click();
    await host.getByRole("button", { name: "Заливка", exact: true }).click();
    const frame = (await host.locator("canvas").boundingBox())!;
    await host.mouse.click(
      frame.x + (500 * frame.width) / 1200,
      frame.y + (270 * frame.height) / 800,
    );
    await expect(host.getByRole("button", { name: /Отменить/u })).toBeEnabled();
    const filled = await canvasHash(host);
    expect(
      await host
        .locator("canvas")
        .evaluate((canvas: HTMLCanvasElement) =>
          Array.from(
            canvas.getContext("2d")!.getImageData(500, 270, 1, 1).data,
          ),
        ),
    ).toEqual([249, 115, 22, 255]);
    await expect.poll(() => canvasHash(friend.page)).toBe(filled);
    await host.getByRole("button", { name: /Отменить/u }).click();
    await expect.poll(() => canvasHash(host)).not.toBe(filled);
    await host.getByRole("button", { name: /Повторить/u }).click();
    await expect.poll(() => canvasHash(host)).toBe(filled);
    await expect.poll(() => canvasHash(viewer.page)).toBe(filled);
    await send(viewer.page, "Похоже на апельсин?");
    await expect(
      friend.page.getByText("Похоже на апельсин?", { exact: true }),
    ).toBeVisible();
    await host.getByRole("button", { name: "Очистить", exact: true }).click();
    await expect.poll(() => canvasHash(viewer.page)).toBe(blank);
    await host.getByRole("button", { name: "Кисть", exact: true }).click();
    await draw(host, [150, 170], [400, 250]);
    await send(viewer.page, `  ${word.toUpperCase().replaceAll("Ё", "Е")}  `);
    for (const playerPage of [host, viewer.page, friend.page]) {
      const result = playerPage.getByRole("dialog", {
        name: "Итоги раунда",
        exact: true,
      });
      await expect(result.getByRole("heading")).toHaveText(
        "Угадайка — победитель!",
      );
      await expect(result.getByText(word, { exact: true })).toBeVisible();
      await expect.poll(() => canvasHash(playerPage)).toBe(blank);
    }
    await expect(host.locator(".tool-button").first()).toBeDisabled();
    await expect(host.getByRole("dialog", { name: "Выбор слова" })).toHaveCount(
      0,
    );
    expect(await canvasHash(host)).toBe(blank);
    await friend.page.reload();
    await expect(
      friend.page
        .getByRole("dialog", { name: "Итоги раунда" })
        .getByRole("heading"),
    ).toHaveText("Угадайка — победитель!");
    await host.screenshot({
      path: testInfo.outputPath("room-desktop.png"),
      fullPage: true,
    });
    await dismissResult(viewer.page);
    await dismissResult(friend.page);
    await friend.page.reload();
    await expect(
      friend.page.getByRole("heading", { name: "Догадки и разговоры" }),
    ).toBeVisible();
    await expect(
      friend.page.getByRole("dialog", { name: "Итоги раунда" }),
    ).toHaveCount(0);
    const nextWord = await chooseWord(host);
    expect(nextWord).not.toBe(word);
    const liveBox = (await host.locator("canvas").boundingBox())!;
    await host.mouse.move(
      liveBox.x + liveBox.width / 4,
      liveBox.y + liveBox.height / 3,
    );
    await host.mouse.down();
    await host.mouse.move(
      liveBox.x + liveBox.width / 2,
      liveBox.y + liveBox.height / 2,
      { steps: 12 },
    );
    await expect.poll(() => canvasHash(friend.page)).not.toBe(blank);
    // Finish the round while the artist is still holding the pointer down.
    await send(friend.page, nextWord);
    await expect(
      host.getByRole("dialog", { name: "Итоги раунда" }).getByRole("heading"),
    ).toHaveText("Друг — победитель!");
    await expect(
      host.getByRole("dialog", { name: "Итоги раунда" }),
    ).toContainText("Раунд 2 завершён");
    await host.mouse.up();
    await expect.poll(() => canvasHash(host)).toBe(blank);
    await expect(host.locator(".error-notice")).toHaveCount(0);
    await dismissResult(viewer.page);
    await dismissResult(friend.page);
    const skippedWord = await chooseWord(host);
    await host
      .getByRole("button", { name: "Новое слово", exact: true })
      .click();
    await expect(
      friend.page.getByText(`Предыдущее слово: ${skippedWord}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      host
        .getByLabel("Выбор слова")
        .locator(".word-picker")
        .getByRole("button"),
    ).toHaveCount(3);
    await chooseWord(host);
    await host
      .getByRole("button", { name: "Назначить рисующим: Друг", exact: true })
      .click();
    await expect(
      friend.page
        .getByLabel("Выбор слова")
        .locator(".word-picker")
        .getByRole("button"),
    ).toHaveCount(3);
    await expect(
      host.getByRole("button", { name: "Кисть", exact: true }),
    ).toHaveCount(0);
    await chooseWord(friend.page);
    await draw(friend.page, [150, 170], [400, 250]);
    await expect
      .poll(() => canvasHash(host))
      .toBe(await canvasHash(friend.page));
    expect(errors).toEqual([]);
  } finally {
    await viewer.context.close();
    await friend.context.close();
  }
});

test("reload, resize, late join, offline recovery and room-code entry", async ({
  page: host,
  browser,
}) => {
  const url = await createRoom(host);
  const word = await chooseWord(host);
  await draw(host, [200, 200], [700, 500]);
  const before = await canvasHash(host);
  await host.setViewportSize({ width: 1000, height: 800 });
  await expect.poll(() => canvasHash(host)).toBe(before);
  await host.reload();
  await expect(
    host.getByRole("button", { name: "Кисть", exact: true }),
  ).toBeEnabled();
  await expect(
    host.getByText(`Рисуем: ${word}`, { exact: true }),
  ).toBeVisible();
  await expect.poll(() => canvasHash(host)).toBe(before);
  const context = await browser.newContext();
  const viewer = await context.newPage();
  try {
    await viewer.goto("/");
    await viewer.getByLabel("Ваш ник").fill("По коду");
    await viewer.getByLabel("Код комнаты").fill(url.split("/").at(-1)!);
    await viewer.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(viewer).toHaveURL(url);
    await expect.poll(() => canvasHash(viewer)).toBe(before);
    await send(viewer, "История сохраняется");
    await viewer.reload();
    await expect(
      viewer.getByText("История сохраняется", { exact: true }),
    ).toBeVisible();
    await host.context().setOffline(true);
    await expect(host.getByText(/Связь прервалась/u)).toBeVisible();
    await expect(
      host.getByRole("button", { name: "Кисть", exact: true }),
    ).toBeDisabled();
    await host.context().setOffline(false);
    await expect(
      host.getByRole("button", { name: "Кисть", exact: true }),
    ).toBeEnabled();
    await expect.poll(() => canvasHash(host)).toBe(before);
    await expect(
      host.getByText(`Рисуем: ${word}`, { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("mobile touch, pen cancellation and responsive layout", async ({
  page: host,
  browser,
}, testInfo) => {
  const url = await createRoom(host);
  const mobile = await joinRoom(browser, url, "С телефона", true);
  const errors: string[] = [];
  mobile.page.on("pageerror", (error) => errors.push(error.message));
  try {
    await chooseWord(host);
    await host
      .getByRole("button", {
        name: "Назначить рисующим: С телефона",
        exact: true,
      })
      .click();
    await chooseWord(mobile.page);
    const blank = await canvasHash(mobile.page);
    await mobile.page.locator("canvas").scrollIntoViewIfNeeded();
    const box = (await mobile.page.locator("canvas").boundingBox())!;
    const client = await mobile.context.newCDPSession(mobile.page);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + 30, y: box.y + 30 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: box.x + 130, y: box.y + 80 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(
      mobile.page.getByRole("button", { name: /Отменить/u }),
    ).toBeEnabled();
    await expect.poll(() => canvasHash(mobile.page)).not.toBe(blank);
    await expect
      .poll(() => canvasHash(host))
      .toBe(await canvasHash(mobile.page));
    const beforeCancel = await canvasHash(mobile.page);
    await mobile.page
      .getByRole("button", { name: "Прямоугольник", exact: true })
      .click();
    await mobile.page.locator("canvas").scrollIntoViewIfNeeded();
    const penBox = (await mobile.page.locator("canvas").boundingBox())!;
    await mobile.page.locator("canvas").evaluate((canvas) => {
      canvas.addEventListener(
        "pointerdown",
        (event) => {
          canvas.dataset.testPointer = String(
            (event as PointerEvent).pointerId,
          );
        },
        { once: true },
      );
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: penBox.x + 40,
      y: penBox.y + 40,
      button: "left",
      buttons: 1,
      pointerType: "pen",
      clickCount: 1,
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: penBox.x + 150,
      y: penBox.y + 100,
      button: "left",
      buttons: 1,
      pointerType: "pen",
    });
    await expect.poll(() => canvasHash(mobile.page)).not.toBe(beforeCancel);
    await mobile.page.locator("canvas").evaluate((canvas) => {
      canvas.dispatchEvent(
        new PointerEvent("pointercancel", {
          pointerId: Number(canvas.dataset.testPointer),
          pointerType: "pen",
          isPrimary: true,
          bubbles: true,
        }),
      );
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: penBox.x + 150,
      y: penBox.y + 100,
      button: "left",
      buttons: 0,
      pointerType: "pen",
      clickCount: 1,
    });
    await expect.poll(() => canvasHash(mobile.page)).toBe(beforeCancel);
    expect(
      await mobile.page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await mobile.page.screenshot({
      path: testInfo.outputPath("room-mobile.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await mobile.context.close();
  }
});

test("invalid room shows a recovery link", async ({ page }) => {
  await page.goto("/game/00000000");
  await page.getByLabel("Ваш ник").fill("Гость");
  await page
    .getByRole("button", { name: "Войти в комнату", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Комната не найдена",
  );
  await expect(
    page.getByRole("link", { name: "Создать новую комнату", exact: true }),
  ).toBeVisible();
});

test("explicit exit transfers the room to the remaining player", async ({
  page: host,
  browser,
}) => {
  const url = await createRoom(host);
  await chooseWord(host);
  const friend = await joinRoom(browser, url, "Новый владелец");
  try {
    await host.getByRole("button", { name: "Выйти", exact: true }).click();
    await expect(host).toHaveURL("http://localhost:3100/");
    await expect(
      friend.page
        .getByLabel("Выбор слова")
        .locator(".word-picker")
        .getByRole("button"),
    ).toHaveCount(3);
    await expect(
      friend.page.getByText("Владелец · Рисует", { exact: true }),
    ).toBeVisible();
    await chooseWord(friend.page);
    await friend.page
      .getByRole("button", { name: "Выйти", exact: true })
      .click();
    await expect(friend.page).toHaveURL("http://localhost:3100/");
    expect(
      await friend.page.evaluate(() =>
        Object.keys(sessionStorage).filter((key) =>
          key.startsWith("crocodile:session:"),
        ),
      ),
    ).toEqual([]);
  } finally {
    await friend.context.close();
  }
});

test("lost server state clears the saved session and offers a new room", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "crocodile:session:00000001",
      JSON.stringify({
        roomId: "00000001",
        playerId: "old-player",
        token: "old-token",
      }),
    );
  });
  await page.goto("/game/00000001");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Комната не найдена",
  );
  await expect(
    page.getByRole("link", { name: "Создать новую комнату", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("crocodile:session:00000001"),
    ),
  ).toBeNull();
});

test("desktop game fits the window during selection, drawing and round results", async ({
  page: host,
  browser,
}, testInfo) => {
  const url = await createRoom(host);
  const friend = await joinRoom(browser, url, "Участник с длинным ником");
  const sizes = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
    { width: 1024, height: 600 },
    { width: 900, height: 600 },
  ];
  const assertFits = async (page: Page) => {
    const layout = await page.evaluate(() => {
      const canvas = document.querySelector("canvas")!.getBoundingClientRect();
      const outside = [
        ...document.querySelectorAll(
          ".game-header, .drawing-panel, canvas, .drawing-toolbar, .tool-button, .color-button, .size-control, .history-actions button, .game-modal, .word-picker button, .players-panel, .chat-panel, .chat-form, .game-footer",
        ),
      ]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            (rect.left < -1 ||
              rect.top < -1 ||
              rect.right > innerWidth + 1 ||
              rect.bottom > innerHeight + 1)
          );
        })
        .map((element) => element.className);
      return {
        pageFits:
          document.documentElement.scrollWidth <= innerWidth + 1 &&
          document.documentElement.scrollHeight <= innerHeight + 1,
        outside,
        ratio: canvas.width / canvas.height,
        canvasHeight: canvas.height,
      };
    });
    expect(layout.pageFits).toBe(true);
    expect(layout.outside).toEqual([]);
    expect(layout.ratio).toBeCloseTo(1.5, 2);
    expect(layout.canvasHeight).toBeGreaterThan(80);
  };
  try {
    for (const viewport of sizes) {
      await host.setViewportSize(viewport);
      await assertFits(host);
    }
    await host.setViewportSize({ width: 1366, height: 768 });
    await host.screenshot({ path: testInfo.outputPath("word-choice.png") });
    const word = await chooseWord(host);
    await draw(host, [150, 150], [800, 650]);
    const picture = await canvasHash(host);
    for (const viewport of sizes) {
      await host.setViewportSize(viewport);
      await assertFits(host);
      expect(await canvasHash(host)).toBe(picture);
    }
    for (let index = 0; index < 20; index += 1)
      await send(
        friend.page,
        `Длинное сообщение ${index}: ${"догадка ".repeat(30)}`,
      );
    await send(friend.page, word);
    await expect(
      host.getByRole("dialog", { name: "Итоги раунда" }),
    ).toBeVisible();
    for (const viewport of sizes) {
      await host.setViewportSize(viewport);
      await friend.page.setViewportSize(viewport);
      await assertFits(host);
      await assertFits(friend.page);
    }
    expect(
      await host
        .locator(".chat-messages")
        .evaluate((node) => node.scrollHeight > node.clientHeight),
    ).toBe(true);
    await host.setViewportSize({ width: 1366, height: 768 });
    await host.screenshot({ path: testInfo.outputPath("room-laptop.png") });
    await dismissResult(host);
    await host.context().setOffline(true);
    await expect(host.locator(".modal-connection")).toBeVisible();
    await assertFits(host);
    await host.context().setOffline(false);
  } finally {
    await friend.context.close();
  }
});

test("word selection modal allows leaving without starting a drawing", async ({
  page,
}) => {
  await createRoom(page);
  await page
    .getByRole("button", { name: "Выйти из комнаты", exact: true })
    .click();
  await expect(page).toHaveURL("http://localhost:3100/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
});
