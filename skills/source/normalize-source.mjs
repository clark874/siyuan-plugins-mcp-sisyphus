#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const TRACKING_KEYS = new Set([
    'fbclid',
    'gclid',
    'mc_cid',
    'mc_eid',
]);

const SAFE_SEMANTIC_KEYS = new Set([
    'branch',
    'lang',
    'locale',
    'page',
    'ref',
    'release',
    'section',
    'tab',
    'tag',
    'v',
    'version',
    'view',
]);

const SENSITIVE_KEYS = new Set([
    'accesstoken',
    'apikey',
    'auth',
    'authorization',
    'credential',
    'credentials',
    'keypairid',
    'key',
    'jwt',
    'password',
    'privatekey',
    'policy',
    'secret',
    'sig',
    'signature',
    'token',
]);

function isSensitiveQueryKey(key) {
    const words = key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
    const compact = words.join('');
    const finalWord = words.at(-1) ?? '';
    return SENSITIVE_KEYS.has(compact)
        || compact.startsWith('xamz')
        || compact.startsWith('xgoog')
        || ['credential', 'credentials', 'password', 'secret', 'signature', 'token'].some((suffix) => compact.endsWith(suffix))
        || compact.endsWith('privatekey')
        || ['credential', 'credentials', 'key', 'password', 'secret', 'sig', 'signature', 'token'].includes(finalWord);
}

export function canonicalizeUrl(input) {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('来源网址只允许 http: 或 https: 协议。');
    }
    if (url.username || url.password) {
        throw new Error('来源网址不得包含用户名或密码。');
    }

    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
        const normalized = key.toLowerCase();
        if (
            normalized.startsWith('utm_')
            || TRACKING_KEYS.has(normalized)
            || isSensitiveQueryKey(key)
            || !SAFE_SEMANTIC_KEYS.has(normalized)
        ) {
            url.searchParams.delete(key);
        }
    }
    url.searchParams.sort();
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
}

function normalizeLineEndings(input) {
    return input.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function splitFrontmatter(input) {
    const normalized = normalizeLineEndings(input);
    const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
    if (!match) return { frontmatter: '', body: normalized };
    return {
        frontmatter: match[1],
        body: normalized.slice(match[0].length),
    };
}

export function normalizeMarkdown(input) {
    const { body } = splitFrontmatter(input);
    const normalized = body
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return `${normalized}\n`;
}

export function sourceDigest(markdown) {
    return createHash('sha256').update(normalizeMarkdown(markdown), 'utf8').digest('hex');
}

export function frontmatterUrl(markdown) {
    const { frontmatter } = splitFrontmatter(markdown);
    const match = frontmatter.match(/^url:\s*(.+?)\s*$/mi);
    return match?.[1]?.trim().replace(/^['"]|['"]$/g, '');
}

async function main() {
    const file = process.argv[2];
    const suppliedUrl = process.argv[3];
    if (!file) {
        throw new Error('用法：node normalize-source.mjs <markdown-file> [url]');
    }
    const markdown = await readFile(file, 'utf8');
    const rawUrl = suppliedUrl || frontmatterUrl(markdown);
    if (!rawUrl) throw new Error('未找到来源网址，请通过第二个参数传入网址。');
    process.stdout.write(`${JSON.stringify({
        canonicalUrl: canonicalizeUrl(rawUrl),
        sha256: sourceDigest(markdown),
        normalizedBytes: Buffer.byteLength(normalizeMarkdown(markdown), 'utf8'),
    })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
