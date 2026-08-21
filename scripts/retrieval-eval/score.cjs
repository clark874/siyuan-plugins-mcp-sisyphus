'use strict';

function mean(values) {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, quantile) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
    return sorted[index];
}

function dcg(relevances, k) {
    return relevances.slice(0, k).reduce((sum, relevance, index) => (
        sum + (2 ** relevance - 1) / Math.log2(index + 2)
    ), 0);
}

function scoreRanking(resultIds, expected, k = 5) {
    const relevanceById = new Map(expected.map((item) => [item.id, item.relevance ?? 1]));
    const rankedRelevances = resultIds.map((id) => relevanceById.get(id) ?? 0);
    const firstRelevantIndex = rankedRelevances.findIndex((value) => value > 0);
    const ideal = [...relevanceById.values()].sort((left, right) => right - left);
    const idealDcg = dcg(ideal, k);
    const hitAt = (limit) => rankedRelevances.slice(0, limit).some((value) => value > 0) ? 1 : 0;
    return {
        hitAt1: hitAt(1),
        hitAt3: hitAt(3),
        hitAt5: hitAt(5),
        mrr: firstRelevantIndex >= 0 ? 1 / (firstRelevantIndex + 1) : 0,
        ndcgAt5: idealDcg > 0 ? dcg(rankedRelevances, k) / idealDcg : 0,
        firstRelevantRank: firstRelevantIndex >= 0 ? firstRelevantIndex + 1 : null,
    };
}

function summarizeBackend(rows) {
    return {
        queryCount: rows.length,
        hitAt1: mean(rows.map((row) => row.metrics.hitAt1)),
        hitAt3: mean(rows.map((row) => row.metrics.hitAt3)),
        hitAt5: mean(rows.map((row) => row.metrics.hitAt5)),
        mrr: mean(rows.map((row) => row.metrics.mrr)),
        ndcgAt5: mean(rows.map((row) => row.metrics.ndcgAt5)),
        resolutionAccuracy: mean(rows.filter((row) => row.resolutionCorrect !== null).map((row) => row.resolutionCorrect ? 1 : 0)),
        falsePositiveRate: mean(rows.filter((row) => typeof row.falsePositive === 'boolean').map((row) => row.falsePositive ? 1 : 0)),
        latencyMs: {
            p50: percentile(rows.map((row) => row.latencyMs), 0.5),
            p95: percentile(rows.map((row) => row.latencyMs), 0.95),
        },
        responseBytes: {
            p50: percentile(rows.map((row) => row.responseBytes), 0.5),
            p95: percentile(rows.map((row) => row.responseBytes), 0.95),
        },
        externalCallCount: rows.filter((row) => row.externalCost === true).length,
        dataEgressCount: rows.filter((row) => row.dataEgress === true).length,
    };
}

module.exports = { scoreRanking, summarizeBackend };
