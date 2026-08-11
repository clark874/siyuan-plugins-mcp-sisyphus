import { describe, expect, it } from 'vitest';

import {
    canonicalizeUrl,
    frontmatterUrl,
    normalizeMarkdown,
    sourceDigest,
} from '../../../skills/siyuan-mcp/siyuan-mcp-knowledge-ingest/scripts/normalize-source.mjs';

describe('knowledge-ingest normalize-source', () => {
    it('removes fragments and tracking parameters while preserving semantic parameters', () => {
        expect(canonicalizeUrl('https://example.org/docs/?utm_source=x&ref=v2&token=secret&version=2#part')).toBe(
            'https://example.org/docs?ref=v2&version=2',
        );
    });

    it.each([
        'api-key',
        'access-token',
        'client.secret',
        'x-goog-signature',
        'X-Amz-Credential',
        'Key-Pair-Id',
        'clientSecret',
        'refreshToken',
        'sessionToken',
        'privateKey',
        'bearerToken',
        'clientsecret',
        'jwt',
        'sessionId',
        'session_id',
        'sid',
        'ticket',
        'authCode',
        'authorizationCode',
        'oauthVerifier',
        'SAMLResponse',
        'assertion',
        'accessJWT',
        'futureUnknownCredential',
    ])('removes secret query key variant %s', (key) => {
        expect(canonicalizeUrl(`https://example.org/docs?${key}=SECRET&ref=manual`)).toBe(
            'https://example.org/docs?ref=manual',
        );
    });

    it('rejects non-web URLs and embedded credentials', () => {
        expect(() => canonicalizeUrl('file:///tmp/source.md')).toThrow('http:');
        expect(() => canonicalizeUrl('javascript:alert(1)')).toThrow('http:');
        expect(() => canonicalizeUrl('https://user:password@example.org/docs')).toThrow('用户名');
    });

    it('ignores all frontmatter metadata, line endings, and trailing whitespace in source hashes', () => {
        const first = '---\r\nurl: https://example.org?utm_source=first\r\ncaptured_at: 2026-08-11T01:00:00Z\r\n---\r\n\r\n# Title  \r\nBody\r\n';
        const second = '---\nurl: https://example.org?utm_source=second\ncaptured_at: 2026-08-12T02:00:00Z\nauthor: Changed metadata\n---\n\n# Title\nBody\n';

        expect(normalizeMarkdown(first)).toBe(normalizeMarkdown(second));
        expect(sourceDigest(first)).toBe(sourceDigest(second));
        expect(sourceDigest(first)).toMatch(/^[a-f0-9]{64}$/);
        expect(sourceDigest(first)).not.toBe(sourceDigest(second.replace('Body', 'Changed body')));
    });

    it('reads a source URL from CRLF frontmatter', () => {
        expect(frontmatterUrl('\uFEFF---\r\nurl: "https://example.org/docs"\r\n---\r\nBody\r\n')).toBe(
            'https://example.org/docs',
        );
    });
});
