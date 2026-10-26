import { z } from 'zod';
import { getEnv } from '../config/env.js';
import { issueCategories, priorities, type AIAnalysis } from '../models/Claim.js';

export const analysisSchema = z.object({
  summary: z.string().trim().min(1).max(1000),
  category: z.enum(issueCategories),
  priority: z.enum(priorities),
  suggestedAction: z.string().trim().min(1).max(1000),
}).strict();

export interface AnalysisInput { productName: string; productCategory: string; modelNumber?: string; issueDescription: string }

export async function analyzeClaim(input: AnalysisInput): Promise<AIAnalysis | null> {
  const { GEMINI_API_KEY, GEMINI_MODEL } = getEnv();
  if (!GEMINI_API_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Assess this warranty issue for a human reviewer. Do not decide eligibility or change status. Product: ${input.productName}. Category: ${input.productCategory}. Model: ${input.modelNumber || 'Not provided'}. Customer report: ${input.issueDescription}` }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: { type: 'OBJECT', properties: {
            summary: { type: 'STRING' }, category: { type: 'STRING', enum: issueCategories },
            priority: { type: 'STRING', enum: priorities }, suggestedAction: { type: 'STRING' },
          }, required: ['summary', 'category', 'priority', 'suggestedAction'] },
        },
      }),
    });
    if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
    const payload: unknown = await response.json();
    const text = z.object({ candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string() })) }) })).min(1) }).parse(payload).candidates[0].content.parts[0].text;
    return analysisSchema.parse(JSON.parse(text));
  } finally { clearTimeout(timeout); }
}
