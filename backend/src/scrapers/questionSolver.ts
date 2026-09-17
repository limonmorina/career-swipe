import { GoogleGenAI, Type, type Schema } from '@google/genai';
import type { MasterProfile } from '../types/profile.js';

export type SolvedAnswer =
  | { kind: 'text'; value: string }
  | { kind: 'option'; value: string }
  | { kind: 'skip'; value: null };

export interface ScreeningQuestionContext {
  question: string;
  options?: string[];
  inputType?: 'text' | 'textarea' | 'radio' | 'checkbox' | 'select' | 'unknown';
  jobTitle?: string;
  company?: string;
  jobDescription?: string;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function yearsOfExperience(profile: MasterProfile): number {
  const now = new Date();
  let totalMonths = 0;

  for (const exp of profile.experiences ?? []) {
    const start = parseYearMonth(exp.startDate);
    if (!start) continue;
    const end =
      exp.endDate === 'Present' ? now : parseYearMonth(exp.endDate) ?? now;
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());
    if (months > 0) totalMonths += months;
  }

  return Math.max(0, Math.round(totalMonths / 12));
}

function parseYearMonth(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function matchOption(options: string[] | undefined, candidates: string[]): string | null {
  if (!options?.length) return null;
  const normalizedOptions = options.map((o) => ({ raw: o, n: normalize(o) }));

  for (const candidate of candidates) {
    const n = normalize(candidate);
    const exact = normalizedOptions.find((o) => o.n === n);
    if (exact) return exact.raw;
  }

  for (const candidate of candidates) {
    const n = normalize(candidate);
    const partial = normalizedOptions.find(
      (o) => o.n.includes(n) || n.includes(o.n)
    );
    if (partial) return partial.raw;
  }

  return null;
}

function yesNoFromBoolean(value: boolean, options?: string[]): SolvedAnswer {
  const preferred = value ? ['yes', 'true', 'y'] : ['no', 'false', 'n'];
  const matched = matchOption(options, preferred);
  if (matched) return { kind: 'option', value: matched };
  return { kind: 'text', value: value ? 'Yes' : 'No' };
}

/**
 * Map common screening questions to MasterProfile / ExtendedPreferences fields.
 */
export function solveFromProfile(
  profile: MasterProfile,
  context: ScreeningQuestionContext
): SolvedAnswer | null {
  const q = normalize(context.question);
  const prefs = profile.extendedPreferences;
  const options = context.options;

  if (
    q.includes('phone') ||
    q.includes('mobile') ||
    q.includes('contact number')
  ) {
    return profile.phone ? { kind: 'text', value: profile.phone } : null;
  }

  if (q.includes('email') || q.includes('e-mail')) {
    return profile.email ? { kind: 'text', value: profile.email } : null;
  }

  if (
    q.includes('city') ||
    q.includes('current location') ||
    (q.includes('location') && !q.includes('relocat'))
  ) {
    return profile.location ? { kind: 'text', value: profile.location } : null;
  }

  if (q.includes('linkedin')) {
    return profile.linkedinUrl
      ? { kind: 'text', value: profile.linkedinUrl }
      : null;
  }

  if (q.includes('github')) {
    return profile.githubUrl ? { kind: 'text', value: profile.githubUrl } : null;
  }

  if (q.includes('portfolio') || q.includes('website') || q.includes('personal site')) {
    return profile.portfolioUrl
      ? { kind: 'text', value: profile.portfolioUrl }
      : null;
  }

  if (
    q.includes('years of experience') ||
    q.includes('how many years') ||
    q.includes('total experience')
  ) {
    const years = String(yearsOfExperience(profile));
    const matched = matchOption(options, [years, `${years}+`, `${years} years`]);
    return matched
      ? { kind: 'option', value: matched }
      : { kind: 'text', value: years };
  }

  if (
    q.includes('work authorization') ||
    q.includes('authorized to work') ||
    q.includes('legally authorized') ||
    q.includes('right to work')
  ) {
    if (prefs?.workAuthorization) {
      const matched = matchOption(options, [
        prefs.workAuthorization,
        'yes',
        'authorized',
      ]);
      if (matched) return { kind: 'option', value: matched };
      if (!options?.length) {
        return { kind: 'text', value: prefs.workAuthorization };
      }
    }
    // Default optimistic yes when options look boolean
    return yesNoFromBoolean(true, options);
  }

  if (
    q.includes('visa') ||
    q.includes('sponsorship') ||
    q.includes('require sponsorship')
  ) {
    const requires = Boolean(prefs?.requiresVisaSponsorship);
    const matched = matchOption(
      options,
      requires
        ? ['yes', 'require sponsorship', prefs?.visaSponsorshipExplanation || '']
        : ['no', 'do not require', 'not required']
    );
    if (matched) return { kind: 'option', value: matched };
    if (requires && prefs?.visaSponsorshipExplanation && !options?.length) {
      return { kind: 'text', value: prefs.visaSponsorshipExplanation };
    }
    return yesNoFromBoolean(requires, options);
  }

  if (q.includes('salary') || q.includes('compensation') || q.includes('expected pay')) {
    const target = prefs?.salaryExpectationTarget ?? prefs?.salaryExpectationMin;
    if (target == null) return null;
    const currency = prefs?.currency || 'USD';
    const text = `${target} ${currency}`;
    const matched = matchOption(options, [
      String(target),
      text,
      `${currency} ${target}`,
    ]);
    return matched ? { kind: 'option', value: matched } : { kind: 'text', value: String(target) };
  }

  if (q.includes('notice period') || q.includes('when can you start') || q.includes('availability')) {
    if (prefs?.noticePeriodDays != null) {
      const days = prefs.noticePeriodDays;
      const text =
        days <= 0
          ? 'Immediately'
          : days % 7 === 0
            ? `${days / 7} weeks`
            : `${days} days`;
      const matched = matchOption(options, [
        text,
        String(days),
        `${days} days`,
        'immediately',
        '2 weeks',
      ]);
      return matched ? { kind: 'option', value: matched } : { kind: 'text', value: text };
    }
  }

  if (q.includes('relocat')) {
    return yesNoFromBoolean(Boolean(prefs?.willingToRelocate), options);
  }

  if (
    q.includes('remote') ||
    q.includes('hybrid') ||
    q.includes('onsite') ||
    q.includes('on-site') ||
    q.includes('work type')
  ) {
    const preferred = prefs?.preferredWorkType;
    if (!preferred) return null;
    const matched = matchOption(options, [
      preferred,
      preferred === 'Onsite' ? 'On-site' : preferred,
      'any',
    ]);
    return matched
      ? { kind: 'option', value: matched }
      : { kind: 'text', value: preferred };
  }

  if (q.includes('first name')) {
    const first = profile.fullName.trim().split(/\s+/)[0];
    return first ? { kind: 'text', value: first } : null;
  }

  if (q.includes('last name') || q.includes('surname') || q.includes('family name')) {
    const parts = profile.fullName.trim().split(/\s+/);
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    return last ? { kind: 'text', value: last } : null;
  }

  return null;
}

async function solveWithGemini(
  profile: MasterProfile,
  context: ScreeningQuestionContext
): Promise<SolvedAnswer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY missing; skipping custom screening question', {
      question: context.question,
    });
    return { kind: 'skip', value: null };
  }

  const ai = new GoogleGenAI({ apiKey });

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      answer: {
        type: Type.STRING,
        description:
          'Short factual answer or exact option label. Empty string if unsure.',
      },
      confidence: {
        type: Type.NUMBER,
        description: 'Confidence 0-1',
      },
    },
    required: ['answer'],
  };

  const prompt = `
You are filling a LinkedIn Easy Apply screening question for a real candidate.
Answer ONLY from the candidate facts. Do not invent experience, degrees, or authorizations.

Job Title: ${context.jobTitle || 'N/A'}
Company: ${context.company || 'N/A'}
Job Description (excerpt):
${(context.jobDescription || '').slice(0, 2500)}

Candidate Profile:
${JSON.stringify(profile, null, 2)}

Question: ${context.question}
Input type: ${context.inputType || 'unknown'}
Available options: ${(context.options || []).join(' | ') || 'none'}

Rules:
- If options exist, return one option EXACTLY as written.
- Keep answers concise (a few words or a number when appropriate).
- If the profile does not support an answer, return an empty answer string.
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

  const parsed = JSON.parse(response.text || '{}') as {
    answer?: string;
    confidence?: number;
  };

  const answer = (parsed.answer || '').trim();
  if (!answer) return { kind: 'skip', value: null };

  if (context.options?.length) {
    const matched = matchOption(context.options, [answer]);
    if (matched) return { kind: 'option', value: matched };
  }

  return { kind: 'text', value: answer };
}

/**
 * Resolve a screening question via profile mapping, then Gemini fallback.
 */
export async function solveScreeningQuestion(
  profile: MasterProfile,
  context: ScreeningQuestionContext
): Promise<SolvedAnswer> {
  const direct = solveFromProfile(profile, context);
  if (direct) return direct;

  try {
    return await solveWithGemini(profile, context);
  } catch (error) {
    console.error('Gemini screening solver failed', {
      question: context.question,
      error,
    });
    return { kind: 'skip', value: null };
  }
}
