import type { Page, Locator } from 'playwright';
import type { JobSearchOptions, ScrapedJob, SearchOptions } from '../types/job.js';
import { pauseBeforeInteraction, randomDelay } from './rateLimiter.js';
import { capturePlaywrightFailure } from '../lib/logger.js';

const SELECTORS = {
  resultsList: [
    '.jobs-search-results-list',
    '.scaffold-layout__list',
    'div.jobs-search-results-list',
    'ul.scaffold-layout__list-container',
  ],
  jobCards: [
    'li.jobs-search-results__list-item',
    'li.scaffold-layout__list-item',
    'div.job-card-container',
    '[data-job-id]',
  ],
  jobTitle: [
    'a.job-card-list__title',
    'a.job-card-container__link',
    '.artdeco-entity-lockup__title a',
    '.job-card-list__title--link',
  ],
  company: [
    '.job-card-container__primary-description',
    '.artdeco-entity-lockup__subtitle',
    '.job-card-container__company-name',
  ],
  location: [
    '.job-card-container__metadata-item',
    '.job-card-container__metadata-wrapper li',
    '.artdeco-entity-lockup__caption',
  ],
  easyApply: [
    '.job-card-container__apply-method',
    '.job-card-list__icon-and-text',
  ],
  description: [
    '.jobs-description-content__text',
    '#job-details',
    '.jobs-box__html-content',
    '.jobs-description__content',
  ],
  postedAt: [
    'time',
    '.jobs-unified-top-card__posted-date',
    '.job-details-jobs-unified-top-card__tertiary-description-container span',
  ],
} as const;

type SelectorKey = keyof typeof SELECTORS;

function normalizeSearchOptions(
  options: SearchOptions | JobSearchOptions,
  limitOverride?: number
): SearchOptions {
  const easyApplyOnly =
    'easyApplyOnly' in options && typeof options.easyApplyOnly === 'boolean'
      ? options.easyApplyOnly
      : Boolean((options as { easyApply?: boolean }).easyApply);

  return {
    keywords: options.keywords,
    location: options.location,
    easyApplyOnly,
    limit: limitOverride ?? options.limit ?? 10,
  };
}

async function withSelectorLog<T>(
  page: Page,
  selectorKey: SelectorKey,
  selector: string,
  action: () => Promise<T>
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    console.error('Playwright selector failed', {
      selectorKey,
      selector,
      url: page.url(),
      error,
    });
    throw error;
  }
}

async function firstVisibleLocator(
  page: Page,
  selectorKey: SelectorKey,
  timeoutMs = 15_000
): Promise<Locator | null> {
  for (const selector of SELECTORS[selectorKey]) {
    try {
      const locator = page.locator(selector).first();
      await withSelectorLog(page, selectorKey, selector, async () => {
        await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      });
      return locator;
    } catch {
      // Try next candidate selector without crashing
    }
  }

  console.warn('No matching visible selector found', {
    selectorKey,
    selectors: SELECTORS[selectorKey],
    url: page.url(),
  });
  return null;
}

export function buildSearchUrl(options: SearchOptions | JobSearchOptions): string {
  const normalized = normalizeSearchOptions(options);
  const params = new URLSearchParams({
    keywords: normalized.keywords,
    location: normalized.location,
  });

  if (normalized.easyApplyOnly) {
    params.set('f_AL', 'true');
  }

  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

function extractJobId(raw: string | null | undefined, href: string | null): string {
  if (raw && /^\d+$/.test(raw.trim())) {
    return raw.trim();
  }

  if (href) {
    const match = href.match(/\/jobs\/view\/(\d+)/) || href.match(/currentJobId=(\d+)/);
    if (match?.[1]) return match[1];
  }

  return '';
}

async function textOrEmpty(locator: Locator | null): Promise<string> {
  if (!locator) return '';
  try {
    const text = await locator.innerText({ timeout: 3_000 });
    return text.replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

async function scrollResultsList(page: Page, list: Locator, passes = 4): Promise<void> {
  for (let i = 0; i < passes; i++) {
    try {
      await list.evaluate((el) => {
        el.scrollBy(0, el.clientHeight);
      });
      await page.waitForTimeout(800);
    } catch (error) {
      console.warn('Failed to scroll job results list', {
        url: page.url(),
        error,
      });
      break;
    }
  }
}

async function collectJobCardLocators(page: Page): Promise<Locator[]> {
  for (const selector of SELECTORS.jobCards) {
    try {
      const cards = page.locator(selector);
      const count = await cards.count();
      if (count > 0) {
        const items: Locator[] = [];
        for (let i = 0; i < count; i++) {
          items.push(cards.nth(i));
        }
        return items;
      }
    } catch (error) {
      console.error('Playwright selector failed', {
        selectorKey: 'jobCards',
        selector,
        url: page.url(),
        error,
      });
    }
  }
  return [];
}

async function extractCardMeta(page: Page, card: Locator): Promise<{
  jobId: string;
  title: string;
  company: string;
  location: string;
  url: string;
  isEasyApply: boolean;
}> {
  let title = '';
  let href: string | null = null;

  for (const selector of SELECTORS.jobTitle) {
    try {
      const titleLink = card.locator(selector).first();
      if ((await titleLink.count()) === 0) continue;
      title = (await titleLink.innerText({ timeout: 2_000 })).replace(/\s+/g, ' ').trim();
      href = await titleLink.getAttribute('href');
      if (title) break;
    } catch (error) {
      console.error('Playwright selector failed', {
        selectorKey: 'jobTitle',
        selector,
        url: page.url(),
        error,
      });
    }
  }

  let company = '';
  for (const selector of SELECTORS.company) {
    try {
      const companyNode = card.locator(selector).first();
      if ((await companyNode.count()) === 0) continue;
      company = (await companyNode.innerText({ timeout: 2_000 })).replace(/\s+/g, ' ').trim();
      if (company) break;
    } catch {
      // continue
    }
  }

  let location = '';
  for (const selector of SELECTORS.location) {
    try {
      const locationNode = card.locator(selector).first();
      if ((await locationNode.count()) === 0) continue;
      location = (await locationNode.innerText({ timeout: 2_000 })).replace(/\s+/g, ' ').trim();
      if (location) break;
    } catch {
      // continue
    }
  }

  let isEasyApply = false;
  for (const selector of SELECTORS.easyApply) {
    try {
      const badge = card.locator(selector).first();
      if ((await badge.count()) === 0) continue;
      const badgeText = (await badge.innerText({ timeout: 1_500 })).toLowerCase();
      if (badgeText.includes('easy apply')) {
        isEasyApply = true;
        break;
      }
    } catch {
      // continue
    }
  }

  if (!isEasyApply) {
    try {
      const cardText = (await card.innerText({ timeout: 2_000 })).toLowerCase();
      isEasyApply = cardText.includes('easy apply');
    } catch {
      // ignore
    }
  }

  const dataJobId = await card.getAttribute('data-job-id');
  const jobId = extractJobId(dataJobId, href);
  const url = jobId
    ? `https://www.linkedin.com/jobs/view/${jobId}/`
    : href
      ? new URL(href, 'https://www.linkedin.com').toString()
      : '';

  return { jobId, title, company, location, url, isEasyApply };
}

async function extractDescription(page: Page): Promise<string> {
  const descriptionNode = await firstVisibleLocator(page, 'description', 10_000);
  return textOrEmpty(descriptionNode);
}

async function extractPostedAt(page: Page): Promise<string> {
  for (const selector of SELECTORS.postedAt) {
    try {
      const node = page.locator(selector).first();
      if ((await node.count()) === 0) continue;
      const text = (await node.innerText({ timeout: 1_500 })).replace(/\s+/g, ' ').trim();
      if (text) return text;
    } catch {
      // continue
    }
  }
  return '';
}

/**
 * Discover LinkedIn jobs for the given search options using an authenticated page.
 */
export async function scrapeJobSearchResults(
  page: Page,
  searchOptions: SearchOptions | JobSearchOptions,
  limit = 10
): Promise<ScrapedJob[]> {
  const options = normalizeSearchOptions(searchOptions, limit);
  const searchUrl = buildSearchUrl(options);

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (error) {
    console.error('Playwright selector failed', {
      selectorKey: 'resultsList',
      selector: searchUrl,
      url: page.url(),
      error,
    });
    throw error;
  }

  const resultsList = await firstVisibleLocator(page, 'resultsList', 30_000);
  if (!resultsList) {
    console.warn('Job results list did not appear; returning empty results', {
      url: page.url(),
    });
    return [];
  }

  await scrollResultsList(page, resultsList);
  await randomDelay(800, 1800);

  const cards = await collectJobCardLocators(page);
  const jobs: ScrapedJob[] = [];
  const seen = new Set<string>();

  for (const card of cards) {
    if (jobs.length >= options.limit) break;

    let meta;
    try {
      meta = await extractCardMeta(page, card);
    } catch (error) {
      console.warn('Skipping job card after metadata extraction failure', {
        url: page.url(),
        error,
      });
      continue;
    }

    if (!meta.jobId || !meta.title || seen.has(meta.jobId)) {
      continue;
    }
    seen.add(meta.jobId);

    try {
      await pauseBeforeInteraction(page);
      await withSelectorLog(page, 'jobCards', 'card-click', async () => {
        await card.click({ timeout: 5_000 });
      });
      await randomDelay(900, 1800);
    } catch (error) {
      console.warn('Failed to open job detail pane; continuing without description', {
        jobId: meta.jobId,
        url: page.url(),
        error,
      });
      await capturePlaywrightFailure(page, {
        jobId: meta.jobId,
        error,
        selectorKey: 'jobCards',
        selector: 'card-click',
        stage: 'discovery-open-card',
      }).catch(() => undefined);
    }

    let description = '';
    try {
      description = await extractDescription(page);
    } catch (error) {
      console.warn('Failed to extract job description', {
        jobId: meta.jobId,
        url: page.url(),
        error,
      });
      await capturePlaywrightFailure(page, {
        jobId: meta.jobId,
        error,
        selectorKey: 'description',
        stage: 'discovery-description',
      }).catch(() => undefined);
    }

    const postedAt = await extractPostedAt(page);

    jobs.push({
      jobId: meta.jobId,
      title: meta.title,
      company: meta.company,
      location: meta.location,
      url: meta.url,
      description,
      isEasyApply: meta.isEasyApply,
      postedAt,
    });

    await randomDelay(700, 1600);
  }

  return jobs;
}
