import type { SiYuanClient } from '../api/client';
import * as blockApi from '../api/block';
import type { PermissionManager } from './permissions';

export function normalizeAnchorToken(value: string): string {
    return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

const ALLOWED_VERIFICATION_TRANSITIONS: Record<string, Set<string>> = {
    '': new Set(['draft', 'source-checked']),
    draft: new Set(['draft', 'source-checked', 'deprecated']),
    'source-checked': new Set(['source-checked', 'execution-verified', 'evidence-verified', 'deprecated']),
    'execution-verified': new Set(['execution-verified', 'deprecated']),
    'evidence-verified': new Set(['evidence-verified', 'deprecated']),
    deprecated: new Set(['deprecated']),
};

export async function validateBlockAttributeMutation(
    client: SiYuanClient,
    permMgr: PermissionManager,
    id: string,
    attrs: Record<string, string>,
): Promise<Record<string, string>> {
    if (Object.prototype.hasOwnProperty.call(attrs, 'custom-progress-recent-event-id')) {
        throw new Error('未知进度属性 custom-progress-recent-event-id；请使用唯一合法字段 custom-progress-last-event-id。');
    }
    const current = await blockApi.getBlockAttrs(client, id);
    const next = { ...current, ...attrs };

    if (Object.prototype.hasOwnProperty.call(attrs, 'name')) {
        const candidate = normalizeAnchorToken(attrs.name);
        if (candidate) {
            await permMgr.reload();
            if (typeof (permMgr as PermissionManager & { getAll?: () => Record<string, string> }).getAll !== 'function') {
                throw new Error('权限管理器无法提供完整授权范围，name 唯一性校验已失败关闭。');
            }
            const rows = await client.requestRead<unknown[]>('/api/query/sql', {
                stmt: "SELECT id, box, name FROM blocks WHERE COALESCE(name, '') != '' LIMIT 10000",
            });
            if (!Array.isArray(rows) || rows.length >= 10000) {
                throw new Error('无法完整验证 name 唯一性；set_attrs 已停止且未写入。');
            }
            const collision = rows.find((row) => {
                if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
                const item = row as Record<string, unknown>;
                return item.id !== id
                    && typeof item.box === 'string'
                    && permMgr.canRead(item.box)
                    && typeof item.name === 'string'
                    && normalizeAnchorToken(item.name) === candidate;
            });
            if (collision) throw new Error(`知识原子 name 与既有可读块冲突：${attrs.name}。`);
        }
    }

    if (Object.prototype.hasOwnProperty.call(attrs, 'custom-verification-status')) {
        const before = current['custom-verification-status'] || '';
        const after = attrs['custom-verification-status'];
        if (!ALLOWED_VERIFICATION_TRANSITIONS[before]?.has(after)) {
            throw new Error(`非法知识验证状态迁移：${before || 'unset'} -> ${after || 'unset'}。`);
        }
    }
    if (next['custom-atom-type'] && !ALLOWED_VERIFICATION_TRANSITIONS[next['custom-verification-status']]) {
        throw new Error('设置 custom-atom-type 时，目标块必须同时具有合法的 custom-verification-status。');
    }
    if (attrs['custom-progress-kind'] === 'knowledge') {
        throw new Error('custom-progress-kind=knowledge 只能由 provenance.record_event 建立。');
    }
    if (next['custom-progress-role'] === 'event') {
        const required = [
            'custom-progress-project-id',
            'custom-progress-event-id',
            'custom-progress-workstream',
            'custom-progress-kind',
            'custom-progress-occurred-at',
            'custom-progress-provider',
            'custom-progress-session-id',
        ];
        const missing = required.filter((name) => !next[name]);
        if (missing.length > 0) throw new Error(`普通进度事件缺少必要属性：${missing.join(', ')}。`);
    }
    return current;
}

export async function validateBlockAttributeMutations(
    client: SiYuanClient,
    permMgr: PermissionManager,
    items: Array<{ id: string; attrs: Record<string, string> }>,
): Promise<void> {
    const requestedNames = new Map<string, string>();
    for (const item of items) {
        if (!Object.prototype.hasOwnProperty.call(item.attrs, 'name')) continue;
        const normalized = normalizeAnchorToken(item.attrs.name);
        if (!normalized) continue;
        const previous = requestedNames.get(normalized);
        if (previous && previous !== item.id) {
            throw new Error(`批量属性写入包含重复的知识原子 name：${item.attrs.name}。`);
        }
        requestedNames.set(normalized, item.id);
    }
    for (const item of items) {
        await validateBlockAttributeMutation(client, permMgr, item.id, item.attrs);
    }
}
