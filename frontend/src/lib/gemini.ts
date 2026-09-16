import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function scoreAndTailorResume(jobDescription: string, userExperience: string) {
  const prompt = `
    You are an expert technical recruiter and resume builder.
    Analyze the following job description against the candidate's experience.

    Job Description:
    ${jobDescription}

    Candidate Experience:
    ${userExperience}

    Provide output in strict JSON format matching this schema:
    {
      "match_score": number (1-100),
      "matching_keywords": string[],
      "tailored_summary": "A concise 3-sentence professional summary targeted at this job",
      "rewritten_bullets": string[],
      "cover_letter": "A 3-paragraph tailored cover letter"
    }
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    },
  });

  return JSON.parse(response.text || '{}');
}