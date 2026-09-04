import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig, ProvenanceAction } from '../../core/config';
import {
    discoverLocalAgentSessions,
    listAtomProvenanceEvents,
    listProjectProvenanceSessions,
    recordProvenanceEvent,
    registerProvenanceSession,
    resolveAgentSessionLink,
    validateLocalAgentSession,
} from '../../core/provenance';
import type { PermissionManager } from '../../core/permissions';
import {
    ProvenanceActionSchema,
    ProvenanceDiscoverSessionSchema,
    ProvenanceListAtomEventsSchema,
    ProvenanceListProjectSessionsSchema,
    ProvenanceRecordEventSchema,
    ProvenanceRegisterSessionSchema,
    ProvenanceResolveSessionLinkSchema,
    ProvenanceValidateSessionSchema,
} from '../../core/types';
import { ensurePermissionForDocumentId } from '../internal/context';
import { defineTool } from '../internal/define-tool';
import { createJsonResult, createZodActionVariant, type ActionVariant, type ToolResult } from '../internal/shared';

export const PROVENANCE_TOOL_NAME = 'provenance';

export const PROVENANCE_GUIDANCE = [
    '交互式知识化应把当前 Agent 会话同时作为 sourceSession 与 compileSession。',
    '定时编译必须区分原始讨论会话和本轮编译会话；未知来源时不得猜测。',
    'record_event 要求 sourceSession 与 compileSession 已登记，并显式提供 workstream；服务端不会隐式注册会话。',
    'linkCapability 决定能否一键打开；不得把 resume_command 宣称为原生深链。',
];

export const PROVENANCE_ACTION_HINTS: Partial<Record<ProvenanceAction, string>> = {
    register_session: '幂等登记一个项目 Agent 会话；本机会话注册即校验，描述性 ID 会收到告警。',
    record_event: '为已登记会话创建唯一知识化事件，一次写齐固定进度属性并回读真实块引用。',
    discover_session: '列出本机最近活跃的 Agent 会话候选；不推断调用方，供注册前选定真实 sessionId。',
    list_project_sessions: '汇总项目内全部已登记 Agent 会话与可用回链。',
    list_atom_events: '从知识原子反查全部知识化事件。',
    resolve_session_link: '解析原生链接、统一启动链接或恢复命令。',
    validate_session: '检查本机会话是否仍有可恢复记录。',
};

export const PROVENANCE_VARIANTS: ActionVariant<ProvenanceAction>[] = [
    createZodActionVariant('register_session', ProvenanceRegisterSessionSchema, PROVENANCE_ACTION_HINTS.register_session!),
    createZodActionVariant('record_event', ProvenanceRecordEventSchema, PROVENANCE_ACTION_HINTS.record_event!),
    createZodActionVariant('discover_session', ProvenanceDiscoverSessionSchema, PROVENANCE_ACTION_HINTS.discover_session!),
    createZodActionVariant('list_project_sessions', ProvenanceListProjectSessionsSchema, PROVENANCE_ACTION_HINTS.list_project_sessions!),
    createZodActionVariant('list_atom_events', ProvenanceListAtomEventsSchema, PROVENANCE_ACTION_HINTS.list_atom_events!),
    createZodActionVariant('resolve_session_link', ProvenanceResolveSessionLinkSchema, PROVENANCE_ACTION_HINTS.resolve_session_link!),
    createZodActionVariant('validate_session', ProvenanceValidateSessionSchema, PROVENANCE_ACTION_HINTS.validate_session!),
];

const provenanceTool = defineTool<ProvenanceAction>({
    name: PROVENANCE_TOOL_NAME,
    description: '🔗 登记、查询并解析项目知识化事件与 Agent 会话之间的溯源关系。',
    variants: PROVENANCE_VARIANTS,
    actionSchema: ProvenanceActionSchema,
    aggregateOptions: { guidance: PROVENANCE_GUIDANCE, actionHints: PROVENANCE_ACTION_HINTS },
    handlers: {
        register_session: async ({ client, rawArgs, permMgr }) => {
            const parsed = ProvenanceRegisterSessionSchema.parse(rawArgs);
            const permission = await ensurePermissionForDocumentId(client, permMgr, parsed.projectBlockId, 'write');
            if (permission.denied) return permission.denied;
            const session = await registerProvenanceSession(client, parsed.projectBlockId, parsed.projectId, parsed.session, parsed.occurredAt);
            const validation = validateLocalAgentSession(parsed.session);
            const warning = validation.status === 'missing'
                ? `sessionId 未在本机 ${parsed.session.provider} 会话记录中找到（checkedBy: ${validation.checkedBy}），无法恢复对应会话。若这是自拟描述性标识，请先 provenance(action="discover_session", provider="${parsed.session.provider}") 获取真实会话 ID 并重新登记。`
                : undefined;
            return createJsonResult({ action: parsed.action, session, validation, warning });
        },
        discover_session: async ({ rawArgs }) => {
            const parsed = ProvenanceDiscoverSessionSchema.parse(rawArgs);
            return createJsonResult({ action: parsed.action, ...discoverLocalAgentSessions(parsed.provider, { limit: parsed.limit, activeWindowSeconds: parsed.activeWindowSeconds }) });
        },
        record_event: async ({ client, rawArgs, permMgr }) => {
            const parsed = ProvenanceRecordEventSchema.parse(rawArgs);
            const ids = [parsed.projectBlockId, ...parsed.targetAtomIds];
            for (const id of ids) {
                const permission = await ensurePermissionForDocumentId(client, permMgr, id, 'write');
                if (permission.denied) return permission.denied;
            }
            const event = await recordProvenanceEvent(client, parsed);
            return createJsonResult({ action: parsed.action, event });
        },
        list_project_sessions: async ({ client, rawArgs, permMgr }) => {
            const parsed = ProvenanceListProjectSessionsSchema.parse(rawArgs);
            const candidates = await listProjectProvenanceSessions(client, parsed.projectId, parsed.limit);
            const sessions = [];
            for (const session of candidates) {
                const permission = await ensurePermissionForDocumentId(client, permMgr, session.blockId, 'read');
                if (!permission.denied) sessions.push(session);
            }
            return createJsonResult({
                action: parsed.action,
                projectId: parsed.projectId,
                sessions: sessions.map((session) => ({
                    ...session,
                    validation: parsed.validate ? validateLocalAgentSession(session) : undefined,
                })),
            });
        },
        list_atom_events: async ({ client, rawArgs, permMgr }) => {
            const parsed = ProvenanceListAtomEventsSchema.parse(rawArgs);
            const permission = await ensurePermissionForDocumentId(client, permMgr, parsed.atomId, 'read');
            if (permission.denied) return permission.denied;
            const candidates = await listAtomProvenanceEvents(client, parsed.atomId, parsed.limit);
            const events = [];
            for (const event of candidates) {
                if (typeof event.blockId !== 'string') continue;
                const eventPermission = await ensurePermissionForDocumentId(client, permMgr, event.blockId, 'read');
                if (!eventPermission.denied) events.push(event);
            }
            return createJsonResult({ action: parsed.action, atomId: parsed.atomId, events });
        },
        resolve_session_link: async ({ rawArgs }) => {
            const parsed = ProvenanceResolveSessionLinkSchema.parse(rawArgs);
            return createJsonResult({ action: parsed.action, link: resolveAgentSessionLink(parsed) });
        },
        validate_session: async ({ rawArgs }) => {
            const parsed = ProvenanceValidateSessionSchema.parse(rawArgs);
            return createJsonResult({ action: parsed.action, link: resolveAgentSessionLink(parsed), validation: validateLocalAgentSession(parsed) });
        },
    },
});

export function listProvenanceTools(config: CategoryToolConfig<ProvenanceAction>) {
    return provenanceTool.listTools(config);
}

export async function callProvenanceTool(client: SiYuanClient, args: Record<string, unknown> | undefined, config: CategoryToolConfig<ProvenanceAction>, permMgr: PermissionManager): Promise<ToolResult> {
    return provenanceTool.callTool(client, args, config, permMgr);
}
