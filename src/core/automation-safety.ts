import type { SiYuanClient } from '../api/client';
import type { PermissionManager } from './permissions';
import { hashWriteState } from './write-safety-hash';
import { createErrorResult, type ToolResult } from '../tools/internal/shared';
import { createSemanticError } from '../tools/internal/validation';
import { escapeSqlString, resolveDocumentContextById, type ResolvedDocumentContext } from '../tools/internal/context';

type RecordValue = Record<string, any>;
interface View { id: string; automations?: { spec?: number; rules?: RecordValue[] }; keyValues?: RecordValue[] }
const nodeID = /^\d{14}-[a-z0-9]{7}$/;
const writableTypes = new Set(['block', 'text', 'number', 'date', 'checkbox', 'select', 'mSelect', 'url', 'email', 'phone']);

function deny(message: string): never {
    throw createSemanticError('permission_denied', message, 'automation_scope_denied');
}

async function supportsAutomation(client: SiYuanClient): Promise<boolean> {
    const version = await client.requestRead<string>('/api/system/version');
    const matched = /^(\d+)\.(\d+)\.(\d+)(?:$|[-+])/.exec(String(version));
    if (!matched) deny('无法确认内核自动化能力，已停止写入。');
    const [major, minor, patch] = matched.slice(1).map(Number);
    return major > 3 || major === 3 && (minor > 8 || minor === 8 && patch >= 7);
}

/** 完整枚举普通及已解锁加密笔记本的定义，不按插件权限过滤内部安全元数据。 */
async function readViews(client: SiYuanClient): Promise<Map<string, View>> {
    const result = new Map<string, View>();
    if (!await supportsAutomation(client)) return result;
    const { notebooks } = await client.requestRead<{ notebooks: RecordValue[] }>('/api/notebook/lsNotebooks');
    if (!Array.isArray(notebooks)) deny('无法完整枚举自动化所属笔记本，已停止写入。');
    const directories = ['/data/storage/av', ...notebooks.filter(n => n.encrypted && n.unlocked && !n.closed).map(n => `/data/${n.id}/storage/av`)];
    for (const path of directories) {
        const entries = await client.requestRead<Array<{ name: string; isDir: boolean }>>('/api/file/readDir', { path });
        if (!Array.isArray(entries)) deny('无法完整读取自动化索引，已停止写入。');
        for (const entry of entries) {
            if (entry.isDir || !entry.name.endsWith('.json') || !nodeID.test(entry.name.slice(0, -5))) continue;
            const id = entry.name.slice(0, -5);
            if (result.has(id)) deny('数据库定义存在跨加密边界标识冲突，已停止写入。');
            const av: View = path === '/data/storage/av'
                ? JSON.parse(await client.readFile(`${path}/${entry.name}`))
                : (await client.requestRead<{ av: View }>('/api/av/getAttributeView', { id })).av;
            if (!av || av.id !== id) deny('数据库索引在检查期间变化，请重新预检。');
            result.set(id, av);
        }
    }
    return result;
}

export async function readAutomationStateHash(client: SiYuanClient): Promise<string | undefined> {
    // 旧客户端模拟对象没有执行期拦截能力；真实客户端始终经过同一检查。
    if (typeof client.withWriteGuard !== 'function') return undefined;
    const views = await readViews(client);
    return hashWriteState([...views].map(([id, view]) => ({ id, config: view.automations ?? null })).sort((a, b) => a.id.localeCompare(b.id)));
}

async function requireNotebook(permMgr: PermissionManager, notebook: string, required: 'read' | 'write'): Promise<void> {
    if (!notebook || !(required === 'write' ? permMgr.canWrite(notebook) : permMgr.canRead(notebook))) {
        deny(`自动化涉及的笔记本 ${notebook || '未知'} 缺少${required === 'write' ? '写入' : '读取'}权限，未提交内容修改。`);
    }
}

/** 一个定义可由多个镜像共享，派生修改必须获得所有存续镜像的授权。 */
async function requireView(client: SiYuanClient, permMgr: PermissionManager, id: string): Promise<void> {
    if (!nodeID.test(id)) deny('自动化目标数据库标识无效。');
    const mirrors = await client.requestRead<{ refDefs: Array<{ refID?: string }> }>('/api/av/getMirrorDatabaseBlocks', { avID: id });
    const rows = await client.requestRead<Array<{ id: string }>>('/api/query/sql', {
        stmt: `SELECT id FROM blocks WHERE type = 'av' AND (markdown LIKE '%${escapeSqlString(id)}%' OR ial LIKE '%${escapeSqlString(id)}%') LIMIT 10001`,
    });
    if (!Array.isArray(rows) || rows.length > 10000) deny('数据库镜像范围无法完整解析，已停止写入。');
    const ids = new Set([...(mirrors.refDefs ?? []).map(row => row.refID), ...rows.map(row => row.id)].filter((v): v is string => typeof v === 'string' && nodeID.test(v)));
    let found = false;
    for (const blockID of ids) {
        const { dom } = await client.requestRead<{ dom: string }>('/api/block/getBlockDOM', { id: blockID });
        if (!dom?.includes('data-type="NodeAttributeView"') || !dom.includes(`data-av-id="${id}"`)) continue;
        const context = await resolveDocumentContextById(client, blockID);
        await requireNotebook(permMgr, context.notebook, 'write');
        found = true;
    }
    if (!found) deny('自动化目标数据库没有可验证的镜像归属，已停止写入。');
}

async function validateConfig(client: SiYuanClient, permMgr: PermissionManager, avID: string, config: RecordValue, views?: Map<string, View>): Promise<void> {
    const source = views?.get(avID) ?? (await client.requestRead<{ av: View }>('/api/av/getAttributeView', { id: avID })).av;
    if (!source || !Array.isArray(config.rules)) deny('无法解析自动化规则，已停止写入。');
    for (const rule of config.rules) {
        if (!rule.enabled) continue;
        if (!['added', 'changed', 'block'].includes(rule.trigger) || !Array.isArray(rule.actions)) deny('启用的自动化规则格式无法验证。');
        if (rule.trigger === 'block') {
            const scope = rule.blockSource;
            if (!scope || !(scope.notebookIDs?.length || scope.documentIDs?.length)) deny('自动收集规则缺少明确来源范围。');
            for (const id of scope.notebookIDs ?? []) await requireNotebook(permMgr, id, 'write');
            for (const id of scope.documentIDs ?? []) {
                const context = await resolveDocumentContextById(client, id);
                await requireNotebook(permMgr, context.notebook, 'write');
            }
        }
        for (const action of rule.actions) {
            const id = action.target === 'current' ? avID
                : action.target === 'filtered' ? action.avID
                    : action.target === 'related' ? source.keyValues?.find(entry => entry.key?.id === action.relationKeyID)?.key?.relation?.avID : undefined;
            if (!id || !['add', 'edit', 'collect'].includes(action.type)) deny('无法确定自动化动作的写入目标。');
            await requireView(client, permMgr, id);
            const target = views?.get(id) ?? (await client.requestRead<{ av: View }>('/api/av/getAttributeView', { id })).av;
            if (!target) deny('自动化目标数据库不存在。');
            for (const [keyID, field] of Object.entries(action.fields ?? {}) as Array<[string, RecordValue]>) {
                const type = target.keyValues?.find(entry => entry.key?.id === keyID)?.key?.type;
                if (!writableTypes.has(type) || field.mode === 'triggerItem') deny('自动化只能写入可验证的文本知识字段，暂不支持关联、资源及计算字段。');
                // 修改绑定主键文本会反写来源块的静态文本属性，不能只校验数据库镜像。
                if (type === 'block' && action.type === 'edit') {
                    for (const entry of target.keyValues ?? []) {
                        if (entry.key?.type !== 'block') continue;
                        for (const value of entry.values ?? []) {
                            const sourceID = value.block?.id;
                            if (typeof sourceID !== 'string' || !sourceID) continue;
                            const context = await resolveDocumentContextById(client, sourceID);
                            await requireNotebook(permMgr, context.notebook, 'write');
                        }
                    }
                }
            }
        }
    }
}

export async function validateAutomationConfig(client: SiYuanClient, permMgr: PermissionManager, avID: string, config: object): Promise<ToolResult | null> {
    try {
        await requireView(client, permMgr, avID);
        await validateConfig(client, permMgr, avID, config);
        return null;
    } catch (error) {
        return createErrorResult(error);
    }
}

function isContentWrite(endpoint: string): boolean {
    return endpoint === '/api/transactions'
        || /^\/api\/block\/(insert|prepend|append|update|delete|move|batch|transfer|fold|unfold)/.test(endpoint)
        || /^\/api\/attr\/(set|batchSet)/.test(endpoint)
        || /^\/api\/filetree\/(create|rename|remove|move)/.test(endpoint)
        || endpoint === '/api/search/findReplace' || /^\/api\/tag\/(rename|remove)/.test(endpoint)
        || /^\/api\/av\/(add|remove|set|batchSet|duplicate)/.test(endpoint);
}

/** 在真正发出内容写请求前复查规则，避免新增动作绕过派生写入权限。 */
export async function withAutomationWriteGuard<T>(client: SiYuanClient, permMgr: PermissionManager, execute: () => Promise<T>): Promise<T> {
    if (typeof client.withWriteGuard !== 'function') return execute();
    let attempted = false;
    let rejected: Error | undefined;
    const result = await client.withWriteGuard(async (endpoint, body) => {
        if (!isContentWrite(endpoint)) return;
        try {
            const views = await readViews(client);
            const content = body as RecordValue;
            const operations: RecordValue[] = endpoint === '/api/transactions'
                ? (content.transactions ?? []).flatMap((batch: RecordValue) => batch.doOperations ?? []) : [content];
            // 保存规则本身不执行旧规则；允许通过同一入口停用不再获授权的规则。
            if (operations.length && operations.every(operation => operation.action === 'setAttrViewAutomations')) {
                for (const operation of operations) {
                    await requireView(client, permMgr, operation.avID);
                    await validateConfig(client, permMgr, operation.avID, operation.data, views);
                }
                attempted = true;
                return;
            }
            const selected = new Set<string>();
            const contexts: ResolvedDocumentContext[] = [];
            // 收集真实请求中的定位符，排除正文/属性中偶然出现的标识。
            const visit = async (value: unknown, key = ''): Promise<void> => {
                if (Array.isArray(value)) { for (const item of value) await visit(item, key); return; }
                if (typeof value === 'string') {
                    if (/^(avID|targetAvID)$/.test(key) && views.has(value)) selected.add(value);
                    else if (/^(id|blockID|parentID|previousID|nextID|fromID|toID|srcIDs|blockIDs|ids|toPath|paths|fromPaths)$/.test(key)) {
                        const ids = value.match(/\d{14}-[a-z0-9]{7}/g) ?? [];
                        for (const id of ids) {
                            try { contexts.push(await resolveDocumentContextById(client, id)); }
                            catch { /* 新插入节点尚不存在；已有父级或目标笔记本继续限定范围。 */ }
                        }
                    }
                    return;
                }
                if (!value || typeof value !== 'object') return;
                for (const [child, item] of Object.entries(value)) {
                    if (['undoOperations', 'attrs', 'fields', 'config', 'markdown', 'dom'].includes(child)) continue;
                    await visit(item, child);
                }
            };
            await visit(content);
            for (const key of ['notebook', 'toNotebook']) if (typeof content[key] === 'string') contexts.push({ notebook: content[key], documentId: '', path: '/' });
            const globalChange = endpoint.includes('/tag/') || endpoint.includes('/search/')
                || endpoint.endsWith('/transferBlockRef') || operations.some(operation => operation.action === 'swapBlockRef') || !contexts.length;
            for (const [id, view] of views) {
                const rules = view.automations?.rules ?? [];
                const relevant: RecordValue[] = [];
                for (const rule of rules) {
                    if (!rule.enabled) continue;
                    if (rule.trigger !== 'block') { if (selected.has(id)) relevant.push(rule); continue; }
                    let matches = globalChange || !rule.blockSource;
                    for (const context of contexts) {
                        if (rule.blockSource?.notebookIDs?.includes(context.notebook)) matches = true;
                        for (const doc of rule.blockSource?.documentIDs ?? []) {
                            if (context.documentId === doc || context.path.includes(`/${doc}/`)) matches = true;
                            // 新文档只有目标笔记本时保守匹配该笔记本，不扩大到其它笔记本。
                            if (!context.documentId) {
                                const scope = await resolveDocumentContextById(client, doc);
                                if (scope.notebook === context.notebook) matches = true;
                            }
                        }
                    }
                    if (matches) relevant.push(rule);
                }
                if (relevant.length) await validateConfig(client, permMgr, id, { rules: relevant }, views);
            }
            for (const operation of operations) {
                if (operation.action === 'setAttrViewAutomations') await validateConfig(client, permMgr, operation.avID, operation.data, views);
            }
            attempted = true;
        } catch (error) {
            rejected = error instanceof Error && 'code' in error ? error
                : createSemanticError('permission_denied', '自动化安全检查未能完成，已停止内容写入，请确认内核与数据库索引后重新预检。', 'automation_scope_unavailable');
            throw rejected;
        }
    }, execute);
    // 处理器可能把异常转成工具错误；多次请求的后续拒绝不能声称零写入。
    if (rejected && attempted) throw rejected;
    return result;
}
