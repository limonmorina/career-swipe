import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export interface AuthenticatedContextConfig {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
}

export interface AuthenticatedLinkedInContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const FEED_SELECTORS = ['.global-nav', '#global-nav', 'header.global-nav'] as const;

/**
 * Create a Playwright browser context authenticated with LinkedIn `li_at`.
 */
export async function createAuthenticatedContext(
  config: AuthenticatedContextConfig = {}
): Promise<AuthenticatedLinkedInContext> {
  const sessionCookie = process.env.LINKEDIN_SESSION_COOKIE;

  if (!sessionCookie) {
    throw new Error(
      'LINKEDIN_SESSION_COOKIE is missing. Set it in the root .env file.'
    );
  }

  const browser = await chromium.launch({
    headless: config.headless ?? false,
  });

  const context = await browser.newContext({
    viewport: config.viewport ?? { width: 1440, height: 900 },
    userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  await context.addCookies([
    {
      name: 'li_at',
      value: sessionCookie.replace(/^"|"$/g, ''),
      domain: '.linkedin.com',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'None',
    },
  ]);

  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * Navigate to the LinkedIn feed and confirm the session is logged in.
 * Returns false when redirected to login/authwall or feed chrome is missing.
 */
export async function verifyLinkedInSession(page: Page): Promise<boolean> {
  try {
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
  } catch (error) {
    console.error('Playwright selector failed', {
      selectorKey: 'feedNavigation',
      selector: 'https://www.linkedin.com/feed/',
      url: page.url(),
      error,
    });
    return false;
  }

  const currentUrl = page.url().toLowerCase();
  if (
    currentUrl.includes('/login') ||
    currentUrl.includes('/uas/login') ||
    currentUrl.includes('/authwall') ||
    currentUrl.includes('/checkpoint')
  ) {
    console.warn('LinkedIn session invalid: redirected to auth page', {
      url: page.url(),
    });
    return false;
  }

  for (const selector of FEED_SELECTORS) {
    try {
      const nav = page.locator(selector).first();
      await nav.waitFor({ state: 'visible', timeout: 10_000 });
      return true;
    } catch (error) {
      console.error('Playwright selector failed', {
        selectorKey: 'globalNav',
        selector,
        url: page.url(),
        error,
      });
    }
  }

  console.warn('LinkedIn session verification failed: feed nav not found', {
    url: page.url(),
  });
  return false;
}

export async function closeAuthenticatedContext(
  session: AuthenticatedLinkedInContext
): Promise<void> {
  await session.context.close();
  await session.browser.close();
}

/** @deprecated Prefer createAuthenticatedContext */
export async function createLinkedInSession(
  options: AuthenticatedContextConfig = {}
): Promise<AuthenticatedLinkedInContext> {
  return createAuthenticatedContext(options);
}

/** @deprecated Prefer closeAuthenticatedContext */
export async function closeLinkedInSession(
  session: AuthenticatedLinkedInContext
): Promise<void> {
  return closeAuthenticatedContext(session);
}

export type LinkedInSession = AuthenticatedLinkedInContext;
