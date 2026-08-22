export const PROJECT_SOURCE_KINDS = ['git', 'directory'] as const;
export const PROJECT_SOURCE_COVERAGES = ['tracked', 'complete', 'curated', 'partial'] as const;
export const PROJECT_SOURCE_ROLES = ['source', 'data', 'output', 'manuscript', 'evidence', 'config'] as const;
export const PROJECT_SOURCE_ACCESSES = ['read-only', 'read-write'] as const;
export const PROJECT_SOURCE_STATUSES = ['available', 'missing', 'stale', 'ambiguous'] as const;
