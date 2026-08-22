import type { SiYuanClient } from '../api/client';
import { createTimelineNode, listTimelineNodes } from '../shared/timeline-service';

export interface DestructiveRecoveryPointRequest {
    requestId: string;
    tool: string;
    action: string;
    targetIds: string[];
}

export interface DestructiveRecoveryPointResult {
    created: boolean;
    replayed: boolean;
    name: string;
    snapshotId: string;
    tag: string;
    targetIds: string[];
}

export async function createDestructiveRecoveryPoint(
    client: SiYuanClient,
    request: DestructiveRecoveryPointRequest,
): Promise<DestructiveRecoveryPointResult> {
    const name = `sisyphus-prewrite ${request.tool}.${request.action} ${request.requestId}`;
    const existing = await listTimelineNodes(client, { scope: 'global', page: 1, pageSize: 200 });
    const node = existing.nodes.find((item) => item.name === name);
    if (node) {
        return {
            created: false,
            replayed: true,
            name,
            snapshotId: node.snapshotId,
            tag: node.tag,
            targetIds: [...request.targetIds].sort(),
        };
    }

    const created = await createTimelineNode(client, { name, scope: 'global' });
    return {
        created: true,
        replayed: false,
        name,
        snapshotId: created.node.snapshotId,
        tag: created.node.tag,
        targetIds: [...request.targetIds].sort(),
    };
}
