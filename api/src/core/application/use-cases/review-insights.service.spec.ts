import { ReviewInsightsService } from './review-insights.service';

describe('ReviewInsightsService', () => {
  it('builds context, calls Gemini once, and persists a fingerprinted result', async () => {
    const entry = {
      id: 'entry-1',
      kind: 'DAILY_REVIEW',
      version: 3,
      timezone: 'Asia/Ho_Chi_Minh',
      dailyReview: {
        periodDate: '2026-08-14',
        wentWellMarkdown: 'Shipped',
        frictionMarkdown: 'Interruptions',
        learnedMarkdown: 'Shorter blocks help',
        contextMarkdown: 'Release day',
      },
    } as any;
    const context = {
      version: 1,
      reviewKind: 'DAILY',
      period: { startDate: '2026-08-14', endDate: '2026-08-14', timezone: 'Asia/Ho_Chi_Minh', startInclusive: '', endExclusive: '' },
      coverage: {},
      metrics: { tasks: { completed: 2 } },
      details: {},
      reflections: { wentWell: 'Shipped' },
      evidence: [],
    };
    const journal = {
      findById: jest.fn().mockResolvedValue(entry),
      saveReviewAiInsights: jest.fn().mockResolvedValue(entry),
    };
    const ai = { generateReviewInsights: jest.fn().mockResolvedValue({ version: 1, headline: 'Good', summary: 'Good', insights: [], attentionNext: [] }) };
    const contextBuilder = { build: jest.fn().mockResolvedValue(context) };
    const service = new ReviewInsightsService(journal as any, ai as any, contextBuilder as any);

    await expect(service.generate('user-1', 'entry-1')).resolves.toBe(entry);
    expect(ai.generateReviewInsights).toHaveBeenCalledWith('user-1', { context, promptVersion: 'review-insights-v1' });
    expect(journal.saveReviewAiInsights).toHaveBeenCalledWith(
      'user-1',
      'entry-1',
      3,
      null,
      context.metrics,
      undefined,
      expect.any(Object),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });
});
