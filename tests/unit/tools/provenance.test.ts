import { describe, expect, it } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import { callProvenanceTool, listProvenanceTools } from '@/tools/provenance';
import { createMockClient } from '../../helpers/mock-client';
import { createMockPermissionManager } from '../../helpers/mock-permissions';
import { parseResult } from '../../helpers/parse-result';

describe('provenance 聚合工具', () => {
    const config = buildDefaultToolConfig().provenance;

    it('公开六个动作的判别式 schema', () => {
        const [tool] = listProvenanceTools(config);
        expect(tool.name).toBe('provenance');
        expect(JSON.stringify(tool.inputSchema)).toContain('list_project_sessions');
        expect(JSON.stringify(tool.inputSchema)).toContain('record_event');
    });

    it('解析 Codex 会话链接而不访问思源写接口', async () => {
        const client = createMockClient();
        const result = await callProvenanceTool(client, {
            action: 'resolve_session_link', provider: 'codex', sessionId: 'thread-1', hostAlias: 'local',
        }, config, createMockPermissionManager());
        const payload = parseResult(result);
        expect(payload.link.nativeUrl).toBe('codex://threads/thread-1');
        expect(client.request).not.toHaveBeenCalled();
    });
});
