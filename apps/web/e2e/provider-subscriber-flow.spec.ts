import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@alphasignal/db";

const password = process.env.SEED_USER_PASSWORD ?? "AlphaSignalSeed!2026";
const providerEmail = "provider@alphasignal.local";
const subscriberEmail = "subscriber@alphasignal.local";
const ticker = "ES1";

test.beforeAll(async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("E2E fixture writes are disabled in production.");
  }
  const users = await prisma.user.findMany({
    where: { email: { in: [providerEmail, subscriberEmail] } },
  });
  if (users.length !== 2) {
    throw new Error("Seed accounts are required. Run `pnpm db:seed` before Playwright E2E tests.");
  }
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("provider approval publishes an algo signal to a live subscriber and queues Telegram delivery", async ({
  browser,
}) => {
  const providerContext = await browser.newContext();
  const subscriberContext = await browser.newContext();
  const providerPage = await providerContext.newPage();
  const subscriberPage = await subscriberContext.newPage();
  await Promise.all([mockMarketData(providerPage), mockMarketData(subscriberPage)]);

  const provider = await prisma.user.findUniqueOrThrow({ where: { email: providerEmail } });
  const subscriber = await prisma.user.update({
    where: { email: subscriberEmail },
    data: { telegramChatId: "e2e-telegram-chat", plan: "PRO", role: "SUBSCRIBER" },
  });
  await prisma.subscription.upsert({
    where: { subscriberId_providerId: { subscriberId: subscriber.id, providerId: provider.id } },
    update: { status: "ACTIVE", currentPeriodEnd: futureDate(), plan: "PRO" },
    create: {
      subscriberId: subscriber.id,
      providerId: provider.id,
      status: "ACTIVE",
      currentPeriodEnd: futureDate(),
      plan: "PRO",
    },
  });
  await prisma.notification.deleteMany({
    where: { userId: subscriber.id, payload: { path: ["ticker"], equals: ticker } },
  });
  await prisma.signal.deleteMany({ where: { providerId: provider.id, ticker } });
  await prisma.algoDetection.deleteMany({ where: { ticker } });

  await login(providerPage, providerEmail);
  await providerPage.goto("/algo/config");
  await expect(providerPage.getByRole("heading", { name: "Scan Configuration" })).toBeVisible();
  await providerPage.getByLabel("Engine Mode").selectOption("APPROVAL");
  await providerPage.getByRole("button", { name: "Save Configuration" }).click();
  await expect(providerPage.getByText("Configuration saved.")).toBeVisible();

  const detection = await prisma.algoDetection.create({
    data: {
      ticker,
      market: "FUTURES",
      timeframe: "M15",
      strategy: "ICT_LIQUIDITY_SWEEP",
      direction: "LONG",
      entry: 5290.25,
      confidence: 86,
      candleTimestamp: new Date(),
      patternData: { sweep: 5285.25, liquidity: 5312.25 },
    },
  });
  const signal = await prisma.signal.create({
    data: {
      providerId: provider.id,
      algoDetectionId: detection.id,
      ticker,
      market: "FUTURES",
      timeframe: "M15",
      direction: "LONG",
      entryPrice: 5290.25,
      stopLoss: 5283.75,
      takeProfit1: 5296.75,
      takeProfit2: 5303.25,
      takeProfit3: 5312.25,
      strategy: "ICT_LIQUIDITY_SWEEP",
      confidence: 86,
      rationale:
        "Liquidity below the session range was swept and reclaimed with displacement. The next opposing level at 5312.25 defines the extended target.",
      keyLevels: { support: [5283.75], resistance: [5312.25], liquidityLevels: [5285.25, 5312.25] },
      source: "ALGO",
      status: "PENDING_APPROVAL",
      riskRewardRatio: 2,
    },
  });

  await login(subscriberPage, subscriberEmail);
  await subscriberPage.goto("/dashboard");
  await expect(subscriberPage.getByText("WS live")).toBeVisible();

  await providerPage.goto("/algo/review");
  const pending = providerPage.locator("article").filter({ hasText: ticker });
  await expect(pending).toContainText(/ICT Liquidity Sweep/i);
  await pending.getByRole("button", { name: "Approve & Publish" }).click();
  await expect(pending).toHaveCount(0);

  const deliveredSignal = subscriberPage.locator("article").filter({ hasText: ticker });
  await expect(deliveredSignal).toContainText("ALGO");
  await deliveredSignal.getByRole("button").click();
  await expect(subscriberPage.locator("#chart canvas").first()).toBeVisible();

  await expect
    .poll(
      () =>
        prisma.notification.count({
          where: {
            userId: subscriber.id,
            signalId: signal.id,
            channel: "TELEGRAM",
            sentAt: { not: null },
          },
        }),
      { timeout: 12_000 },
    )
    .toBe(1);

  await Promise.all([providerContext.close(), subscriberContext.close()]);
});

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function mockMarketData(page: Page): Promise<void> {
  await page.route("**/market/ohlcv**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ candles: candles() }),
    }),
  );
  await page.route("**/market/quote**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quote: { ticker, market: "FUTURES", price: 5292, time: Date.now() } }),
    }),
  );
}

function candles() {
  const start = Math.floor(Date.now() / 1000) - 120 * 900;
  return Array.from({ length: 120 }, (_, index) => {
    const base = 5280 + index * 0.1;
    return {
      time: start + index * 900,
      open: base,
      high: base + 3,
      low: base - 2,
      close: base + 1,
      volume: 1500 + index,
    };
  });
}

function futureDate(): Date {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}
