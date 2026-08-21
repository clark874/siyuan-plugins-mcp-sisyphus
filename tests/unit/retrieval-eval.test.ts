import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { scoreRanking, summarizeBackend } = require('../../scripts/retrieval-eval/score.cjs') as {
    scoreRanking: (resultIds: string[], expected: Array<{ id: string; relevance: number }>) => Record<string, number | null>;
    summarizeBackend: (rows: Array<Record<string, any>>) => Record<string, any>;
};

describe('retrieval evaluation scorer', () => {
    it('computes ranked retrieval metrics with graded relevance', () => {
        const metrics = scoreRanking(
            ['noise', 'target-secondary', 'target-primary'],
            [
                { id: 'target-primary', relevance: 3 },
                { id: 'target-secondary', relevance: 1 },
            ],
        );

        expect(metrics.hitAt1).toBe(0);
        expect(metrics.hitAt3).toBe(1);
        expect(metrics.mrr).toBe(0.5);
        expect(metrics.firstRelevantRank).toBe(2);
        expect(metrics.ndcgAt5).toBeGreaterThan(0);
        expect(metrics.ndcgAt5).toBeLessThan(1);
    });

    it('keeps no-answer queries measurable without inventing relevance', () => {
        const metrics = scoreRanking(['unexpected'], []);
        expect(metrics.hitAt1).toBe(0);
        expect(metrics.mrr).toBe(0);
        expect(metrics.ndcgAt5).toBe(0);
        expect(metrics.firstRelevantRank).toBeNull();
    });

    it('reports false-positive rate, latency, response size and external calls', () => {
        const summary = summarizeBackend([
            {
                metrics: { hitAt1: 1, hitAt3: 1, hitAt5: 1, mrr: 1, ndcgAt5: 1 },
                resolutionCorrect: true,
                falsePositive: false,
                latencyMs: 10,
                responseBytes: 100,
                externalCost: false,
                dataEgress: false,
            },
            {
                metrics: { hitAt1: 0, hitAt3: 0, hitAt5: 0, mrr: 0, ndcgAt5: 0 },
                resolutionCorrect: false,
                falsePositive: true,
                latencyMs: 20,
                responseBytes: 200,
                externalCost: true,
                dataEgress: true,
            },
        ]);

        expect(summary.hitAt1).toBe(0.5);
        expect(summary.resolutionAccuracy).toBe(0.5);
        expect(summary.falsePositiveRate).toBe(0.5);
        expect(summary.latencyMs).toEqual({ p50: 10, p95: 20 });
        expect(summary.responseBytes).toEqual({ p50: 100, p95: 200 });
        expect(summary.externalCallCount).toBe(1);
        expect(summary.dataEgressCount).toBe(1);
    });
});
