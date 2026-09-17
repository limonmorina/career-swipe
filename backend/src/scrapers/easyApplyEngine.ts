import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import type { MasterProfile } from '../types/profile.js';
import {
  solveScreeningQuestion,
  type SolvedAnswer,
} from './questionSolver.js';

export interface EasyApplyOptions {
  jobId: string;
  profile: MasterProfile;
  resumeUrl?: string | null;
  jobTitle?: string;
  company?: string;
  jobDescription?: string;
  dryRun?: boolean;
  maxSteps?: number;
}

export interface EasyApplyResult {
  success: boolean;
  submitted: boolean;
  dryRun: boolean;
  stepsCompleted: number;
  screenshotPath?: string;
  message: string;
}

const SELECTORS = {
  easyApplyButton: [
    'button.jobs-apply-button',
    'button:has-text("Easy Apply")',
    '.jobs-apply-button--top-card button',
  ],
  modal: [
    '.jobs-easy-apply-modal',
    '.jobs-easy-apply-content',
    '[role="dialog"]',
  ],
  nextButton: [
    'button[aria-label="Continue to next step"]',
    'button[aria-label="Continue"]',
    'button:has-text("Next")',
    'button:has-text("Continue")',
    'button:has-text("Review")',
  ],
  submitButton: [
    'button[aria-label="Submit application"]',
    'button:has-text("Submit application")',
    'button:has-text("Submit")',
  ],
  dismiss: [
    'button[aria-label="Dismiss"]',
    'button[aria-label="Close"]',
    'button:has-text("Done")',
  ],
  fileInput: ['input[type="file"]'],
} as const;

type SelectorKey = keyof typeof SELECTORS;

function isDryRun(explicit?: boolean): boolean {
  if (typeof explicit === 'boolean') return explicit;
  return String(process.env.DRY_RUN || 'true').toLowerCase() !== 'false';
}

async function withSelectorLog<T>(
  page: Page,
  selectorKey: string,
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

async function clickFirst(
  page: Page,
  selectorKey: SelectorKey,
  root?: Locator,
  timeoutMs = 8_000
): Promise<boolean> {
  for (const selector of SELECTORS[selectorKey]) {
    try {
      const locator = (root ?? page).locator(selector).first();
      await withSelectorLog(page, selectorKey, selector, async () => {
        await locator.waitFor({ state: 'visible', timeout: timeoutMs });
        await locator.click({ timeout: timeoutMs });
      });
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

async function findModal(page: Page): Promise<Locator | null> {
  for (const selector of SELECTORS.modal) {
    try {
      const locator = page.locator(selector).first();
      await withSelectorLog(page, 'modal', selector, async () => {
        await locator.waitFor({ state: 'visible', timeout: 15_000 });
      });
      return locator;
    } catch {
      // try next
    }
  }
  return null;
}

async function downloadResumeToTemp(
  resumeUrl: string,
  jobId: string
): Promise<string> {
  const response = await fetch(resumeUrl);
  if (!response.ok) {
    throw new Error(`Failed to download resume PDF (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const tempPath = path.join(os.tmpdir(), `careerswipe-${jobId}-resume.pdf`);
  await fs.writeFile(tempPath, buffer);
  return tempPath;
}

async function attachResume(
  page: Page,
  modal: Locator,
  resumeUrl: string,
  jobId: string
): Promise<boolean> {
  let tempPath: string | null = null;
  try {
    tempPath = await downloadResumeToTemp(resumeUrl, jobId);

    for (const selector of SELECTORS.fileInput) {
      try {
        const input = modal.locator(selector).first();
        if ((await input.count()) === 0) continue;

        await withSelectorLog(page, 'fileInput', selector, async () => {
          await input.setInputFiles(tempPath!);
        });
        console.log('Attached resume PDF to Easy Apply modal', { jobId });
        return true;
      } catch (error) {
        console.error('Playwright selector failed', {
          selectorKey: 'fileInput',
          selector,
          url: page.url(),
          error,
        });
      }
    }

    // LinkedIn sometimes hides file input outside modal root
    for (const selector of SELECTORS.fileInput) {
      try {
        const input = page.locator(selector).first();
        if ((await input.count()) === 0) continue;
        await input.setInputFiles(tempPath);
        console.log('Attached resume PDF via page-level file input', { jobId });
        return true;
      } catch {
        // continue
      }
    }

    return false;
  } finally {
    if (tempPath) {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  }
}

function fieldLabelText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function escapeCssId(id: string): string {
  return id.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

async function getLabelForControl(
  modal: Locator,
  control: Locator
): Promise<string> {
  const labelledBy = await control.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy.split(/\s+/);
    const texts: string[] = [];
    for (const id of parts) {
      const label = modal.locator(`#${escapeCssId(id)}`).first();
      if ((await label.count()) > 0) {
        texts.push(fieldLabelText(await label.innerText()));
      }
    }
    if (texts.join(' ')) return texts.join(' ');
  }

  const ariaLabel = await control.getAttribute('aria-label');
  if (ariaLabel) return fieldLabelText(ariaLabel);

  const id = await control.getAttribute('id');
  if (id) {
    const byFor = modal.locator(`label[for="${id}"]`).first();
    if ((await byFor.count()) > 0) {
      return fieldLabelText(await byFor.innerText());
    }
  }

  const parentLabel = control.locator('xpath=ancestor::label[1]');
  if ((await parentLabel.count()) > 0) {
    return fieldLabelText(await parentLabel.innerText());
  }

  const nearby = control.locator(
    'xpath=ancestor::*[contains(@class,"form-element") or contains(@class,"jobs-easy-apply")][1]//label'
  ).first();
  if ((await nearby.count()) > 0) {
    return fieldLabelText(await nearby.innerText());
  }

  return '';
}

async function applyAnswer(
  page: Page,
  control: Locator,
  answer: SolvedAnswer,
  options?: string[]
): Promise<void> {
  if (answer.kind === 'skip' || !answer.value) return;

  const tag = (await control.evaluate((el) => el.tagName.toLowerCase())) as string;
  const type = ((await control.getAttribute('type')) || '').toLowerCase();

  if (tag === 'select') {
    try {
      await control.selectOption({ label: answer.value });
      return;
    } catch {
      try {
        await control.selectOption({ value: answer.value });
        return;
      } catch (error) {
        console.warn('Failed to select dropdown option', { answer, error });
      }
    }
  }

  if (type === 'radio' || type === 'checkbox') {
    const value = answer.value.toLowerCase();
    const groupName = await control.getAttribute('name');
    if (groupName) {
      const group = page.locator(`input[name="${groupName}"]`);
      const count = await group.count();
      for (let i = 0; i < count; i++) {
        const option = group.nth(i);
        const label = await getLabelForControl(page.locator('body'), option);
        const optionValue = (await option.getAttribute('value')) || '';
        if (
          label.toLowerCase().includes(value) ||
          optionValue.toLowerCase() === value ||
          options?.some((o) => o.toLowerCase() === label.toLowerCase() && o === answer.value)
        ) {
          await option.check({ force: true }).catch(async () => {
            await option.click({ force: true });
          });
          return;
        }
      }
    }
    await control.check({ force: true }).catch(async () => {
      await control.click({ force: true });
    });
    return;
  }

  await control.fill('');
  await control.fill(answer.value);
}

async function collectOptionsForControl(
  modal: Locator,
  control: Locator
): Promise<string[]> {
  const tag = (await control.evaluate((el) => el.tagName.toLowerCase())) as string;
  if (tag === 'select') {
    return control.locator('option').allTextContents().then((opts) =>
      opts.map((o) => o.trim()).filter(Boolean)
    );
  }

  const type = ((await control.getAttribute('type')) || '').toLowerCase();
  if (type === 'radio' || type === 'checkbox') {
    const name = await control.getAttribute('name');
    if (!name) return [];
    const group = modal.locator(`input[name="${name}"]`);
    const count = await group.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const label = await getLabelForControl(modal, group.nth(i));
      if (label) labels.push(label);
    }
    return labels;
  }

  return [];
}

async function fillVisibleFields(
  page: Page,
  modal: Locator,
  options: EasyApplyOptions
): Promise<void> {
  const controls = modal.locator(
    'input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]), textarea, select'
  );
  const count = await controls.count();

  const seenRadioGroups = new Set<string>();

  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    try {
      if (!(await control.isVisible())) continue;

      const type = ((await control.getAttribute('type')) || '').toLowerCase();
      const name = (await control.getAttribute('name')) || `anon-${i}`;

      if (type === 'radio') {
        if (seenRadioGroups.has(name)) continue;
        seenRadioGroups.add(name);
      }

      const disabled = await control.isDisabled();
      if (disabled) continue;

      const currentValue = await control.inputValue().catch(() => '');
      if (currentValue && type !== 'radio' && type !== 'checkbox') {
        continue;
      }

      const label = await getLabelForControl(modal, control);
      if (!label) continue;

      const optionLabels = await collectOptionsForControl(modal, control);
      const answer = await solveScreeningQuestion(options.profile, {
        question: label,
        options: optionLabels,
        inputType:
          type === 'radio'
            ? 'radio'
            : type === 'checkbox'
              ? 'checkbox'
              : (await control.evaluate((el) => el.tagName.toLowerCase())) === 'select'
                ? 'select'
                : type === 'textarea' ||
                    (await control.evaluate((el) => el.tagName.toLowerCase())) ===
                      'textarea'
                  ? 'textarea'
                  : 'text',
        jobTitle: options.jobTitle,
        company: options.company,
        jobDescription: options.jobDescription,
      });

      await applyAnswer(page, control, answer, optionLabels);
      await page.waitForTimeout(200);
    } catch (error) {
      console.warn('Failed to fill Easy Apply field', {
        index: i,
        url: page.url(),
        error,
      });
    }
  }
}

async function isSubmitStep(modal: Locator): Promise<boolean> {
  for (const selector of SELECTORS.submitButton) {
    const button = modal.locator(selector).first();
    if ((await button.count()) > 0 && (await button.isVisible().catch(() => false))) {
      return true;
    }
  }
  return false;
}

async function advanceStep(page: Page, modal: Locator): Promise<'next' | 'submit' | 'stuck'> {
  if (await isSubmitStep(modal)) return 'submit';

  const clickedNext = await clickFirst(page, 'nextButton', modal, 5_000);
  if (clickedNext) {
    await page.waitForTimeout(900);
    return 'next';
  }

  return 'stuck';
}

/**
 * Drive LinkedIn Easy Apply for a single job using profile answers and optional resume PDF.
 */
export async function runEasyApply(
  page: Page,
  options: EasyApplyOptions
): Promise<EasyApplyResult> {
  const dryRun = isDryRun(options.dryRun);
  const maxSteps = options.maxSteps ?? 12;
  const jobUrl = `https://www.linkedin.com/jobs/view/${options.jobId}/`;

  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (error) {
    console.error('Playwright selector failed', {
      selectorKey: 'jobPage',
      selector: jobUrl,
      url: page.url(),
      error,
    });
    throw error;
  }

  const launched = await clickFirst(page, 'easyApplyButton', undefined, 20_000);
  if (!launched) {
    throw new Error('Easy Apply button not found on job page');
  }

  const modal = await findModal(page);
  if (!modal) {
    throw new Error('Easy Apply modal did not appear');
  }

  let stepsCompleted = 0;
  let resumeAttached = false;

  while (stepsCompleted < maxSteps) {
    stepsCompleted += 1;

    if (options.resumeUrl && !resumeAttached) {
      resumeAttached = await attachResume(
        page,
        modal,
        options.resumeUrl,
        options.jobId
      );
    }

    await fillVisibleFields(page, modal, options);

    const advance = await advanceStep(page, modal);
    if (advance === 'next') continue;

    if (advance === 'submit') {
      if (dryRun) {
        const screenshotPath = path.resolve(
          process.cwd(),
          'logs',
          'dry-run',
          `${options.jobId}-${Date.now()}.png`
        );
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: true });

        await clickFirst(page, 'dismiss', modal, 3_000).catch(() => false);

        return {
          success: true,
          submitted: false,
          dryRun: true,
          stepsCompleted,
          screenshotPath,
          message: 'Dry run complete. Submit button was not clicked.',
        };
      }

      const submitted = await clickFirst(page, 'submitButton', modal, 8_000);
      if (!submitted) {
        throw new Error('Submit application button not clickable');
      }

      await page.waitForTimeout(2_000);
      await clickFirst(page, 'dismiss', undefined, 5_000).catch(() => false);

      return {
        success: true,
        submitted: true,
        dryRun: false,
        stepsCompleted,
        message: 'Application submitted.',
      };
    }

    // stuck: try one more fill pass then exit loop
    await fillVisibleFields(page, modal, options);
    const retry = await advanceStep(page, modal);
    if (retry === 'stuck') {
      throw new Error('Easy Apply navigation stuck; no Next/Submit button found');
    }
    if (retry === 'submit') {
      // loop will handle submit on next iteration via isSubmitStep
      continue;
    }
  }

  throw new Error(`Easy Apply exceeded max steps (${maxSteps})`);
}
