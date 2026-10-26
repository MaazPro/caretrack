import { Claim } from '../models/Claim.js';
import { analyzeClaim, type AnalysisInput } from './ai.service.js';

export async function assessPersistedClaim(claimId: string, input: AnalysisInput): Promise<void> {
  try {
    const analysis = await analyzeClaim(input);
    await Claim.findByIdAndUpdate(claimId, analysis
      ? { $set: { aiAnalysis: analysis, aiStatus: 'COMPLETED' } }
      : { $set: { aiStatus: 'UNAVAILABLE' } });
  } catch (error) {
    console.error('AI assessment failed for claim', claimId, error);
    try {
      await Claim.findByIdAndUpdate(claimId, { $set: { aiStatus: 'FAILED' } });
    } catch (updateError) {
      console.error('Unable to record AI assessment failure for claim', claimId, updateError);
    }
  }
}
