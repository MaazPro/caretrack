import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeClaim } from '../src/services/ai.service.js';

const input = { productName: 'Fan', productCategory: 'Fan', issueDescription: 'The fan does not spin.' };
beforeEach(() => { process.env.MONGODB_URI = 'mongodb://localhost:27017/test'; process.env.JWT_SECRET = 'caretrack-test-secret-32-characters-minimum'; process.env.GEMINI_API_KEY = 'test-key'; process.env.GEMINI_MODEL = 'test-model'; });
afterEach(() => vi.unstubAllGlobals());
describe('Gemini analysis', () => {
  it('accepts a validated structured response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'Motor issue', category: 'Mechanical', priority: 'MEDIUM', suggestedAction: 'Inspect motor' }) }] } }] }) }));
    await expect(analyzeClaim(input)).resolves.toMatchObject({ category: 'Mechanical', priority: 'MEDIUM' });
  });
  it('rejects malformed analysis', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"priority":"CRITICAL"}' }] } }] }) }));
    await expect(analyzeClaim(input)).rejects.toThrow();
  });
  it('propagates provider failure for the claim route to handle', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(analyzeClaim(input)).rejects.toThrow('offline');
  });
});
