import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, type Schema } from '@google/genai';
import type { MasterProfile } from '@/types/profile';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

type TailorRequestBody = {
  jobTitle?: string;
  company?: string;
  jobDescription?: string;
  profile?: MasterProfile;
};

export async function POST(req: NextRequest) {
  try {
    const { jobTitle, company, jobDescription, profile } =
      (await req.json()) as TailorRequestBody;

    if (!jobDescription || !profile) {
      return NextResponse.json(
        { error: 'Missing required fields: jobDescription or profile' },
        { status: 400 }
      );
    }

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        matchScore: {
          type: Type.INTEGER,
          description:
            'Percentage match (1-100) comparing profile skills/experience to the job requirement.',
        },
        matchAnalysis: {
          type: Type.STRING,
          description:
            'A 2-sentence summary explaining strengths and missing key qualifications.',
        },
        proposals: {
          type: Type.ARRAY,
          description: 'Line-by-line resume bullet suggestions.',
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              experienceId: { type: Type.STRING },
              originalBullet: { type: Type.STRING },
              proposedBullet: { type: Type.STRING },
              reasoning: { type: Type.STRING },
            },
            required: ['id', 'originalBullet', 'proposedBullet', 'reasoning'],
          },
        },
        coverLetter: {
          type: Type.STRING,
          description:
            'A professional 3-paragraph cover letter tailored specifically to this role.',
        },
      },
      required: ['matchScore', 'matchAnalysis', 'proposals', 'coverLetter'],
    };

    const prompt = `
      You are an expert resume reviewer and career coach.
      Analyze the candidate's Master Profile against the provided Job Description.

      Job Title: ${jobTitle || 'N/A'}
      Company: ${company || 'N/A'}
      
      Job Description:
      ${jobDescription}

      Candidate Master Profile:
      ${JSON.stringify(profile, null, 2)}

      Instructions:
      1. Calculate an accurate Match Score (1-100%).
      2. Analyze the candidate's experience bullets. For bullets that can be strengthened using keywords or technologies mentioned in the job description WITHOUT fabricating facts or lying, propose concise, high-impact rewritten bullets.
      3. For each proposed bullet, provide a brief reasoning why the change helps.
      4. Write a professional, tailored 3-paragraph cover letter.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    });

    const result = JSON.parse(response.text || '{}');
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error('Tailor API Route Error:', error);
    const message =
      error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
