import puppeteer, { type Browser, type Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { logger } from "./logger";
import * as fs from "fs/promises";

const SESSION_FILE = "/tmp/ok_session.json";
const DEBUG_SCREENSHOTS = process.env.OK_DEBUG === "true";

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function screenshot(page: Page, name: string): Promise<void> {
  if (!DEBUG_SCREENSHOTS) return;
  try {
    await page.screenshot({ path: `/tmp/ok_debug_${name}.png` });
    logger.info({ name }, "Screenshot saved to /tmp/ok_debug_*.png");
  } catch {
    // ignore
  }
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
  if (cookies.length === 0) {
    logger.warn("No cookies to save after login attempt");
    return;
  }
  await fs.writeFile(SESSION_FILE, JSON.stringify(cookies, null, 2));
  logger.info(`Saved ${cookies.length} cookies`);
}

async function loadCookies(page: Page): Promise<boolean> {
  try {
    const raw = await fs.readFile(SESSION_FILE, "utf-8");
    const cookies = JSON.parse(raw);
    if (!Array.isArray(cookies) || cookies.length === 0) return false;
    // Filter out expired cookies
    const now = Math.floor(Date.now() / 1000);
    const valid = cookies.filter((c) => !c.expires || c.expires === -1 || c.expires > now);
    if (valid.length === 0) {
      logger.info("All cookies expired, will re-login");
      return false;
    }
    await page.setCookie(...valid);
    logger.info(`Loaded ${valid.length} valid cookies`);
    return true;
  } catch {
    return false;
  }
}

async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto("https://ok.ru", { waitUntil: "domcontentloaded", timeout: 30000 });
  await randomDelay(2000, 3500);
  await screenshot(page, "check_login");
  const url = page.url();
  logger.info({ url }, "Checked OK.ru login status");
  // If we're on the main feed or profile — we're logged in
  const isLoginPage =
    url.includes("/dk?st.layer") ||
    url.includes("login") ||
    url.includes("auth") ||
    url.includes("sign_in");
  return !isLoginPage;
}

async function login(page: Page): Promise<void> {
  const phone = process.env.PHONE;
  const password = process.env.PASSWORD;
  if (!phone || !password) {
    throw new Error("PHONE or PASSWORD env variable not set");
  }

  logger.info("Logging in to OK.ru...");

  // Try multiple login pages OK.ru supports
  const loginUrls = [
    "https://ok.ru/dk?st.cmd=anonymMain&st.acc=logout",
    "https://ok.ru",
  ];

  for (const loginUrl of loginUrls) {
    try {
      await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await randomDelay(2000, 4000);
      await screenshot(page, "login_page");

      // Try to find login form — OK.ru uses different selectors
      const emailInput =
        (await page.$('input[name="st.email"]')) ||
        (await page.$('input[name="st.phone"]')) ||
        (await page.$('input[type="text"]')) ||
        (await page.$('input[name="email"]')) ||
        (await page.$('input.inputW:nth-of-type(1)'));

      if (!emailInput) {
        logger.warn("Could not find email/phone input on OK.ru login page");
        continue;
      }

      await emailInput.click();
      await randomDelay(300, 700);
      await emailInput.type(phone, { delay: 80 + Math.random() * 60 });
      await randomDelay(400, 900);

      const passwordInput =
        (await page.$('input[name="st.password"]')) ||
        (await page.$('input[type="password"]')) ||
        (await page.$('input.inputW:nth-of-type(2)'));

      if (!passwordInput) {
        logger.warn("Could not find password input on OK.ru login page");
        continue;
      }

      await passwordInput.click();
      await randomDelay(300, 700);
      await passwordInput.type(password, { delay: 80 + Math.random() * 60 });
      await randomDelay(600, 1200);

      // Click submit — try multiple selectors
      const submitBtn =
        (await page.$('input[type="submit"]')) ||
        (await page.$('button[data-log="click.authorize"]')) ||
        (await page.$('button[type="submit"]')) ||
        (await page.$('.pro-button'));

      if (submitBtn) {
        await submitBtn.click();
      } else {
        // Fallback: press Enter
        await passwordInput.press("Enter");
      }

      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {
        // Sometimes navigation doesn't fire but page still loads
      });
      await randomDelay(2000, 4000);
      await screenshot(page, "after_login");

      const url = page.url();
      if (url.includes("st.error") || url.includes("authError")) {
        throw new Error("Ошибка авторизации на OK.ru. Проверь логин и пароль.");
      }

      // Check if we actually got past the login page
      if (url.includes("login") || url.includes("sign_in") || url.includes("dk?st.layer")) {
        logger.warn("Still on login page after submit, trying next URL");
        continue;
      }

      logger.info({ url }, "Logged in to OK.ru successfully");
      return;
    } catch (err) {
      logger.warn({ err }, "Login attempt failed for URL: " + loginUrl);
    }
  }

  throw new Error("Не удалось войти в Одноклассники. Проверь логин и пароль.");
}

export interface OkNotificationData {
  unreadCount: number;
  details: string;
}

async function countNotificationsFromPage(page: Page): Promise<number> {
  // Strategy 1: Try to extract count from page title (e.g. "(3) Уведомления")
  const title = await page.title();
  const titleMatch = title.match(/\((\d+)\)/);
  if (titleMatch) {
    const count = parseInt(titleMatch[1], 10);
    if (!isNaN(count)) {
      logger.info({ title, count }, "Got notification count from page title");
      return count;
    }
  }

  // Strategy 2: Try nav badge selectors (multiple OK.ru layouts)
  const badgeSelectors = [
    '[data-l="t,notifBell"] .badge_cnt',
    '.bell .cnt',
    '[data-ba="notifBell"] .badge',
    '.topNav__notif .badge',
    '.toolbar-icon-badge',
    '[data-notif-badge]',
    '.notifBell .badge',
    '.top-nav_item .badge',
    '.icon-bell + .badge',
  ];

  for (const selector of badgeSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const text = await el.evaluate((node) => node.textContent?.trim() ?? "");
        const count = parseInt(text.replace(/\D/g, ""), 10);
        if (!isNaN(count) && count > 0) {
          logger.info({ selector, text, count }, "Got notification count from badge");
          return count;
        }
      }
    } catch {
      // ignore
    }
  }

  // Strategy 3: Count unread notification items on the page
  const itemSelectors = [
    '.notificationsList .notification.unread',
    '.notifications-list .item.unread',
    '.feed-w.unread',
    '[data-notification] .unread',
    '.notification-item.unread',
    '.notifier.unread',
    '[class*="notif"] .unread',
    '.entity.unread',
  ];

  for (const selector of itemSelectors) {
    try {
      const items = await page.$$(selector);
      if (items.length > 0) {
        logger.info({ selector, count: items.length }, "Counted unread notification items");
        return items.length;
      }
    } catch {
      // ignore
    }
  }

  // Strategy 4: Try to read from the page body text
  try {
    const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
    // Look for patterns like "3 непрочитанных" or "У вас 5 уведомлений"
    const patterns = [
      /(\d+)\s*н.?епр.?очитанн/i,
      /(\d+)\s*уведомлен/i,
      /(\d+)\s*новых?\s*сообщен/i,
    ];
    for (const pattern of patterns) {
      const match = bodyText.match(pattern);
      if (match) {
        const count = parseInt(match[1], 10);
        logger.info({ pattern: pattern.source, count }, "Got count from page body text");
        return count;
      }
    }
  } catch {
    // ignore
  }

  return 0;
}

export async function getOkUnreadNotifications(): Promise<OkNotificationData> {
  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Mask webdriver detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      // Override permissions query
      const originalQuery = window.navigator.permissions?.query;
      if (originalQuery) {
        window.navigator.permissions.query = (parameters: any) =>
          parameters.name === "notifications"
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : originalQuery.call(window.navigator.permissions, parameters);
      }
    });

    await page.setExtraHTTPHeaders({ "Accept-Language": "ru-RU,ru;q=0.9" });

    // Try to restore session
    const cookiesLoaded = await loadCookies(page);
    if (cookiesLoaded) {
      const loggedIn = await isLoggedIn(page);
      if (!loggedIn) {
        logger.info("Session expired, re-logging in");
        await login(page);
        await saveCookies(page);
      } else {
        logger.info("Session is valid, already logged in");
      }
    } else {
      logger.info("No saved session, logging in");
      await login(page);
      await saveCookies(page);
    }

    // Navigate to notifications
    await randomDelay(1500, 3000);
    logger.info("Navigating to notifications page...");
    await page.goto("https://ok.ru/notifications", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await randomDelay(3000, 5000);
    await screenshot(page, "notifications_page");

    const unreadCount = await countNotificationsFromPage();
    const details =
      unreadCount === 0
        ? "Непрочитанных уведомлений нет"
        : `Непрочитанных уведомлений: ${unreadCount}`;

    logger.info({ unreadCount, details }, "OK notifications check complete");
    return { unreadCount, details };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
    logger.error({ err }, "Failed to get OK notifications");
    throw new Error(`Не удалось получить уведомления: ${msg}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function clearOkSession(): Promise<void> {
  try {
    await fs.unlink(SESSION_FILE);
    // Also clean up debug screenshots
    await fs.rm("/tmp/ok_debug_*.png", { force: true }).catch(() => {});
    logger.info("OK session cleared");
  } catch {
    // file didn't exist
  }
}
