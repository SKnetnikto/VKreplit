import puppeteer, { type Browser, type Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { logger } from "./logger";
import * as fs from "fs/promises";
import * as path from "path";

const SESSION_FILE = "/tmp/ok_session.json";

// Delay helper with randomness to avoid bot detection
function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = await chromium.executablePath();
  return puppeteer.launch({
    args: [
      ...chromium.args,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--window-size=1280,800",
      "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ],
    defaultViewport: { width: 1280, height: 800 },
    executablePath,
    headless: true,
  });
}

async function saveCookies(page: Page): Promise<void> {
  const cookies = await page.cookies();
  await fs.writeFile(SESSION_FILE, JSON.stringify(cookies, null, 2));
  logger.info("OK session cookies saved");
}

async function loadCookies(page: Page): Promise<boolean> {
  try {
    const raw = await fs.readFile(SESSION_FILE, "utf-8");
    const cookies = JSON.parse(raw) as Array<{
      name: string;
      value: string;
      domain?: string;
      path?: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
    }>;
    if (!cookies.length) return false;
    await page.setCookie(...cookies);
    logger.info("OK session cookies loaded");
    return true;
  } catch {
    return false;
  }
}

async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto("https://ok.ru", { waitUntil: "domcontentloaded", timeout: 30000 });
  await randomDelay(1500, 3000);
  const url = page.url();
  // If we're NOT on the login page — we're logged in
  return !url.includes("/dk?st") && !url.includes("login") && !url.includes("sign_in");
}

async function login(page: Page): Promise<void> {
  const phone = process.env.PHONE;
  const password = process.env.PASSWORD;

  if (!phone || !password) {
    throw new Error("PHONE or PASSWORD env variable not set");
  }

  logger.info("Logging in to OK.ru...");

  await page.goto("https://ok.ru", { waitUntil: "domcontentloaded", timeout: 30000 });
  await randomDelay(2000, 4000);

  // Type phone with human-like delays
  await page.type('input[name="st.email"]', phone, { delay: 80 + Math.random() * 60 });
  await randomDelay(500, 1200);
  await page.type('input[name="st.password"]', password, { delay: 80 + Math.random() * 60 });
  await randomDelay(800, 1500);

  await page.click('input[type="submit"]');
  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 });
  await randomDelay(2000, 4000);

  const url = page.url();
  if (url.includes("st.error") || url.includes("authError")) {
    throw new Error("Ошибка авторизации на OK.ru. Проверь логин и пароль.");
  }

  logger.info({ url }, "Logged in to OK.ru successfully");
}

export interface OkNotificationData {
  unreadCount: number;
  details: string;
}

export async function getOkUnreadNotifications(): Promise<OkNotificationData> {
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Mask webdriver detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    // Set Accept-Language header to Russian
    await page.setExtraHTTPHeaders({ "Accept-Language": "ru-RU,ru;q=0.9" });

    const cookiesLoaded = await loadCookies(page);

    if (cookiesLoaded) {
      const loggedIn = await isLoggedIn(page);
      if (!loggedIn) {
        logger.info("Session expired, re-logging in");
        await login(page);
        await saveCookies(page);
      }
    } else {
      await login(page);
      await saveCookies(page);
    }

    // Navigate to notifications page
    await randomDelay(1000, 2500);
    await page.goto("https://ok.ru/notifications", { waitUntil: "domcontentloaded", timeout: 30000 });
    await randomDelay(2000, 4000);

    // Try to get notification count from the badge
    let unreadCount = 0;
    let details = "";

    try {
      // First try the badge counter on nav
      const badgeText = await page.$eval(
        '[data-l="t,notifBell"] .badge_cnt, .notif-count, [data-type="notification"] .nav_count, .nav-count',
        (el) => el.textContent?.trim() ?? "0"
      ).catch(() => "0");

      const parsed = parseInt(badgeText.replace(/\D/g, ""), 10);
      if (!isNaN(parsed)) {
        unreadCount = parsed;
      }
    } catch {
      // ignore
    }

    // If badge didn't work, count unread items on the page
    if (unreadCount === 0) {
      try {
        const unreadItems = await page.$$eval(
          '.notification-item.unread, .feed-w.unread, [class*="notify"][class*="unread"]',
          (els) => els.length
        );
        unreadCount = unreadItems;
      } catch {
        // ignore
      }
    }

    // Get page title which often contains the count like "(3) Уведомления"
    const title = await page.title();
    const titleMatch = title.match(/\((\d+)\)/);
    if (titleMatch) {
      unreadCount = parseInt(titleMatch[1], 10);
    }

    details = unreadCount === 0
      ? "Непрочитанных уведомлений нет"
      : `Непрочитанных уведомлений: ${unreadCount}`;

    return { unreadCount, details };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function clearOkSession(): Promise<void> {
  try {
    await fs.unlink(SESSION_FILE);
    logger.info("OK session cleared");
  } catch {
    // file didn't exist
  }
}
