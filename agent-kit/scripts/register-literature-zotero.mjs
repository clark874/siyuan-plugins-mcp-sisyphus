const itemKeyPattern = /^[A-Z0-9]{8}$/;
const doiPattern = /^10\.\d{4,9}\/\S+$/;
const nonBibliographicTypes = new Set(['attachment', 'note', 'annotation']);

const normalize = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const year = value => /\b(?:1[0-9]{3}|2[0-9]{3})\b/.exec(String(value ?? ''))?.[0] ?? '';

function rejectedWrite(message) {
    return Object.assign(Error(message), { code: 'zotero_not_created' });
}

function doi(value) {
    let normalized = normalize(value).replace(/^doi\s*:\s*/, '');
    if (/^https?:\/\/(?:dx\.)?doi\.org\//.test(normalized)) {
        try { normalized = decodeURIComponent(new URL(normalized).pathname.slice(1)); }
        catch { return ''; }
    }
    return doiPattern.test(normalized) ? normalized.toLowerCase() : '';
}

function doiSet(item) {
    return new Set([
        doi(item.DOI), doi(item.url),
        ...Array.from(String(item.extra ?? '').matchAll(/^\s*doi\s*:\s*(\S+)\s*$/gim), match => doi(match[1])),
    ].filter(Boolean));
}

function creatorNames(item) {
    if (!Array.isArray(item.creators)) return [];
    const authors = item.creators.filter(person => person?.creatorType === 'author');
    return (authors.length ? authors : item.creators).map(person =>
        normalize(person?.name || [person?.firstName, person?.lastName].filter(Boolean).join(' ')));
}

function validateIdentity(row, expected, expectedDoi, key) {
    const actual = row?.data;
    if (row?.key !== key || actual?.key !== key || actual.deleted || actual.parentItem) {
        throw Error('Zotero 条目键不存在、未回读一致或条目已在回收站');
    }
    const actualDoi = doiSet(actual);
    const expectedCreators = creatorNames(expected);
    if (actual.itemType !== expected.itemType || normalize(actual.title) !== normalize(expected.title)
        || (expectedDoi && (actualDoi.size !== 1 || !actualDoi.has(expectedDoi)))
        || (year(expected.date) && year(actual.date) !== year(expected.date))
        || (expectedCreators.length && JSON.stringify(creatorNames(actual)) !== JSON.stringify(expectedCreators))
        || (expected.archiveID && normalize(actual.archiveID) !== normalize(expected.archiveID))) {
        throw Error('Zotero 现有条目的作品身份或版本与核对书目不一致');
    }
    return { key, data: actual };
}

function libraryEndpoint(config) {
    let base;
    try { base = new URL(config?.baseUrl); }
    catch { throw Error('Zotero 文库地址无效'); }
    if (base.origin !== 'https://api.zotero.org' || !/^\/(users|groups)\/\d+\/?$/.test(base.pathname)
        || base.username || base.password || base.search || base.hash
        || typeof config.apiKey !== 'string' || !config.apiKey.trim()) {
        throw Error('Zotero 配置必须使用官方文库地址与私有凭据');
    }
    return base.href.replace(/\/$/, '');
}

function responseInteger(response, header) {
    const raw = response.headers.get(header);
    const value = /^\d+$/.test(raw ?? '') ? Number(raw) : NaN;
    if (!Number.isSafeInteger(value)) throw Error(`Zotero 分页响应缺少有效的 ${header}`);
    return value;
}

async function scanLibrary(request, relevant) {
    const matches = [];
    const keys = new Set();
    let version;
    let total;
    do {
        const response = await request(`/items/top?includeTrashed=1&limit=100&start=${keys.size}`);
        const pageVersion = responseInteger(response, 'Last-Modified-Version');
        const pageTotal = responseInteger(response, 'Total-Results');
        if (version !== undefined && (pageVersion !== version || pageTotal !== total)) {
            throw Error('Zotero 文库在查重时发生变化，请按同一清单重跑');
        }
        version = pageVersion;
        total = pageTotal;
        const page = await response.json();
        if (!Array.isArray(page) || keys.size + page.length > total || (!page.length && keys.size < total)) {
            throw Error('Zotero 条目分页不完整，停止登记');
        }
        for (const row of page) {
            if (!itemKeyPattern.test(row?.key ?? '') || !row.data || typeof row.data.itemType !== 'string' || keys.has(row.key)) {
                throw Error('Zotero 条目分页存在重复键或条目身份不全，停止登记');
            }
            keys.add(row.key);
            if (relevant(row.data)) matches.push(row);
        }
    } while (keys.size < total);
    return { version, matches };
}

/** 按已核对身份登记书目。调用者负责持久化已返回的键。 */
export async function ensureZoteroItem(config, record, { execute = false, checkpoint, beforeCreate = async () => {}, fetcher = globalThis.fetch } = {}) {
    const base = libraryEndpoint(config);
    const expected = record?.zoteroItem;
    const boundKey = record?.zoteroKey;
    if (!expected || typeof expected.title !== 'string' || !expected.title.trim()
        || typeof expected.itemType !== 'string' || !/^[a-z][A-Za-z]+$/.test(expected.itemType)
        || nonBibliographicTypes.has(expected.itemType)
        || (boundKey !== undefined && !itemKeyPattern.test(boundKey))) throw Error('Zotero 书目或条目键无效');
    if (execute && typeof checkpoint !== 'function') throw Error('Zotero 写入需要可持久化条目键的回执');
    const expectedDois = doiSet(expected);
    if (expectedDois.size > 1 || (expected.DOI && !doi(expected.DOI))) throw Error('Zotero 待登记 DOI 无效或相互冲突');
    const expectedDoi = expectedDois.values().next().value;
    const request = async (route, { method = 'GET', body, version, template = false } = {}) => {
        const response = await fetcher((template ? 'https://api.zotero.org' : base) + route, {
            method, redirect: 'error', signal: AbortSignal.timeout(20000),
            headers: { 'Zotero-API-Key': config.apiKey, 'Zotero-API-Version': '3',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...(version !== undefined ? { 'If-Unmodified-Since-Version': String(version) } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (method === 'POST' && response.status === 412) throw rejectedWrite('Zotero 文库版本已变更，未完成登记，请重新查重');
        if (method === 'POST' && [400, 401, 403, 404, 409, 413, 422].includes(response.status)) {
            throw rejectedWrite(`Zotero 拒绝新建请求，HTTP ${response.status}`);
        }
        if (!response.ok) throw Error(`Zotero ${method} HTTP ${response.status}`);
        return response;
    };
    const read = async key => validateIdentity(await (await request(`/items/${key}`)).json(), expected, expectedDoi, key);
    if (boundKey) {
        const item = await read(boundKey);
        if (execute) await checkpoint(boundKey);
        return item;
    }

    const sameTitle = item => normalize(item.title) === normalize(expected.title);
    const exactDoi = item => Boolean(expectedDoi && doiSet(item).has(expectedDoi));
    const sameArchiveId = item => Boolean(expected.archiveID && normalize(item.archiveID) === normalize(expected.archiveID));
    const { version, matches } = await scanLibrary(request, item => !nonBibliographicTypes.has(item.itemType)
        && (sameTitle(item) || exactDoi(item) || sameArchiveId(item)));
    const precise = matches.filter(row => exactDoi(row.data) || sameArchiveId(row.data));
    const candidates = precise.length ? precise : matches;
    if (candidates.length > 1) throw Error('Zotero 查重得到多个候选，请先核对具体版本及条目键');
    if (candidates.length) {
        const candidate = candidates[0];
        if (candidate.data.deleted) throw Error('Zotero 对应条目已在回收站，请核对后再登记');
        if (!precise.length && (!year(expected.date) || !creatorNames(expected).length)) {
            throw Error('Zotero 同名候选缺少可比较的作者或年份，请提供已核实的条目键');
        }
        const item = await read(candidate.key);
        if (execute) await checkpoint(candidate.key);
        return item;
    }
    if (record.createRequested === true) throw Error('Zotero 先前的新建请求仍待对账，未找到可核实条目，不重复新建');
    if (!expectedDoi && (!year(expected.date) || !creatorNames(expected).length || creatorNames(expected).includes(''))) {
        throw Error('无 DOI 的 Zotero 新条目需要完整题名、作者和年份，或提供已核实的条目键');
    }
    if (!execute) return { key: null, data: null };

    const template = await (await request(`/items/new?itemType=${encodeURIComponent(expected.itemType)}`, { template: true })).json();
    if (template?.itemType !== expected.itemType || Object.keys(expected).some(field => !Object.hasOwn(template, field))) {
        throw Error('Zotero 待写字段与条目类型模板不符');
    }
    await beforeCreate();
    let result;
    try {
        const response = await request('/items', { method: 'POST', body: [{ ...template, ...expected,
            ...(expectedDoi && Object.hasOwn(template, 'DOI') ? { DOI: expectedDoi } : {}) }], version });
        result = await response.json();
    } catch (error) {
        if (error.code === 'zotero_not_created') throw error;
        throw Error('Zotero 新建结果未确认，请按同一清单重跑查重', { cause: error });
    }
    if (Number.isInteger(result?.failed?.['0']?.code) && !result?.successful?.['0']) {
        throw rejectedWrite('Zotero 拒绝登记该条目，请检查已核对书目');
    }
    const key = result?.successful?.['0']?.key;
    if (!itemKeyPattern.test(key ?? '')) throw Error('Zotero 未返回新建键，请按同一清单重跑查重');
    await checkpoint(key);
    return read(key);
}
