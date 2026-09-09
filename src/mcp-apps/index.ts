import { App } from '@modelcontextprotocol/ext-apps/app-with-deps';
import './style.css';

type JsonObject = Record<string, any>;
const root = document.querySelector<HTMLElement>('#app')!;
const app = new App({ name: 'SiYuan Timeline', version: '1.0.0' }, {}, { autoResize: true, strict: true });
let documentId = '';
let nodes: JsonObject[] = [];
let comparison: JsonObject | undefined;
let permissions = new Set<string>();
let busy = false;
let notice = '';

app.ontoolinput = (params) => {
    const args = isObject(params.arguments) ? params.arguments : {};
    if (typeof args.documentId === 'string') documentId = args.documentId;
};
app.ontoolresult = (result) => handleResult(result);
app.onhostcontextchanged = (context) => { document.documentElement.dataset.theme = context.theme === 'dark' ? 'dark' : 'light'; };

root.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!button || button.disabled) return;
    if (button.dataset.action === 'refresh') void call('list_nodes');
    if (button.dataset.action === 'compare' && button.dataset.tag) void call('compare_node', { tag: button.dataset.tag });
    if (button.dataset.action === 'back') { comparison = undefined; render(); }
});
root.addEventListener('submit', (event) => {
    const form = event.target as HTMLFormElement;
    if (!form.matches('[data-create]')) return;
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const scope = String(data.get('scope') ?? 'global');
    if (name) void call('create_node', { name, scope }).then(() => call('list_nodes'));
});

async function call(action: 'list_nodes' | 'create_node' | 'compare_node', extra: JsonObject = {}) {
    if (busy || !permissions.has(action)) return;
    busy = true;
    notice = '';
    render();
    try {
        const args: JsonObject = { action, ...extra };
        if (action === 'list_nodes') Object.assign(args, { scope: documentId ? 'all' : 'global', ...(documentId ? { documentId } : {}), page: 1, pageSize: 50 });
        if (action === 'create_node' && args.scope === 'document') args.documentId = documentId;
        if (action === 'compare_node') args.documentId = documentId;
        const result = await app.callServerTool({ name: 'timeline_app_action', arguments: args });
        if (isObject(result) && result.isError) throw new Error(resultMessage(result));
        handleResult(result);
    } catch (error) {
        notice = error instanceof Error ? error.message : String(error);
    } finally {
        busy = false;
        render();
    }
}

function handleResult(result: unknown) {
    if (!isObject(result)) return;
    const permissionMeta = isObject(result._meta) ? result._meta['io.siyuan-sisyphus/timeline-permissions'] : undefined;
    if (isObject(permissionMeta) && Array.isArray(permissionMeta.appActions)) permissions = new Set(permissionMeta.appActions.map(String));
    const payload = resultPayload(result);
    if (!payload) return;
    if (typeof payload.documentId === 'string') documentId = payload.documentId;
    if (payload.action === 'list_nodes') { nodes = Array.isArray(payload.nodes) ? payload.nodes : []; comparison = undefined; }
    if (payload.action === 'compare_node') comparison = payload;
    if (payload.action === 'create_node') notice = '时间线节点已创建';
    render();
}

function render() {
    const body = comparison ? renderComparison(comparison) : renderNodes();
    root.innerHTML = `<section class="shell"><header><div><h1>文档时间线</h1><p>${documentId ? `文档 ${escapeHtml(shortId(documentId))}` : '全局节点'}</p></div>${comparison ? '<button data-action="back">返回</button>' : `<button data-action="refresh" ${permissions.has('list_nodes') ? '' : 'disabled'}>刷新</button>`}</header>${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}<main>${body}</main><div class="busy ${busy ? 'active' : ''}"></div></section>`;
}

function renderNodes() {
    const form = `<form data-create><input name="name" maxlength="80" placeholder="节点名称" required><select name="scope">${documentId ? '<option value="document">当前文档</option>' : ''}<option value="global">全局</option></select><button ${permissions.has('create_node') ? '' : 'disabled'}>创建</button></form>`;
    const list = nodes.length ? nodes.map((node) => `<article><div><strong>${escapeHtml(String(node.name ?? node.tag ?? '未命名节点'))}</strong><small>${escapeHtml(formatTime(node.created))}</small></div><button data-action="compare" data-tag="${escapeHtml(String(node.tag ?? ''))}" ${documentId && permissions.has('compare_node') ? '' : 'disabled'}>比较</button></article>`).join('') : '<p class="empty">暂无时间线节点</p>';
    return form + `<div class="nodes">${list}</div>`;
}

function renderComparison(payload: JsonObject) {
    const changes = Array.isArray(payload.changes) ? payload.changes : [];
    if (!changes.length) return '<p class="empty">当前文档与该节点没有差异</p>';
    return `<div class="changes">${changes.map((change) => `<article><strong>${escapeHtml(String(change.breadcrumb ?? change.blockId ?? '变更块'))}</strong><pre>${escapeHtml(JSON.stringify(change, null, 2))}</pre></article>`).join('')}</div>`;
}

function resultPayload(result: JsonObject): JsonObject | undefined {
    if (isObject(result.structuredContent)) return result.structuredContent;
    const text = Array.isArray(result.content) ? result.content.find((item: JsonObject) => item?.type === 'text')?.text : undefined;
    if (typeof text !== 'string') return undefined;
    try { const parsed = JSON.parse(text); return isObject(parsed) ? parsed : { value: parsed }; } catch { return { value: text }; }
}
function resultMessage(result: JsonObject) { const payload = resultPayload(result); return String(payload?.error?.message ?? payload?.message ?? '工具调用失败'); }
function isObject(value: unknown): value is JsonObject { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function shortId(value: string) { return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value; }
function formatTime(value: unknown) { const time = Number(value); return Number.isFinite(time) ? new Date(time).toLocaleString() : '未知时间'; }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }

root.innerHTML = '<p class="loading">正在连接 MCP Host…</p>';
void app.connect().then(() => {
    document.documentElement.dataset.theme = app.getHostContext()?.theme === 'dark' ? 'dark' : 'light';
    window.setTimeout(() => { if (!permissions.size) render(); }, 250);
}).catch((error) => { notice = error instanceof Error ? error.message : String(error); render(); });
