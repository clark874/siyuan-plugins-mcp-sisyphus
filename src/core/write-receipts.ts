import type { ToolCategory } from './config';
import { hashWriteState } from './write-safety-hash';

export type PendingWriteState = 'executing' | 'unknown' | 'pending_verification';

export interface WriteStatusSource {
    requestId: string;
    tool: ToolCategory;
    action: string;
    argsHash: string;
    operationKey?: string;
    state: string;
    createdAt: number;
    updatedAt: number;
    targetIds: string[];
    result?: Record<string, unknown>;
}

export interface WriteStatusReceipt {
    requestId: string;
    operationKey: string;
    tool: ToolCategory;
    action: string;
    state: string;
    writeExecuted: boolean;
    retryAllowed: boolean;
    targetIds: string[];
    createdAt: number;
    updatedAt: number;
    result?: Record<string, unknown>;
    nextCall?: {
        tool: 'system';
        action: 'get_write_status';
        args: { action: 'get_write_status'; requestId: string };
        exact: string;
    };
}

export function deriveWriteOperationKey(tool: ToolCategory, action: string, argsHash: string): string {
    return hashWriteState({ tool, action, argsHash });
}

export function isPendingWriteState(state: string): state is PendingWriteState {
    return state === 'executing' || state === 'unknown' || state === 'pending_verification';
}

export function writeStatusNextCall(requestId: string): WriteStatusReceipt['nextCall'] {
    return {
        tool: 'system',
        action: 'get_write_status',
        args: { action: 'get_write_status', requestId },
        exact: `system(action="get_write_status", requestId="${requestId}")`,
    };
}

export function toWriteStatusReceipt(entry: WriteStatusSource): WriteStatusReceipt {
    const operationKey = entry.operationKey ?? deriveWriteOperationKey(entry.tool, entry.action, entry.argsHash);
    const resultWriteExecuted = entry.result?.writeExecuted;
    const writeExecuted = typeof resultWriteExecuted === 'boolean'
        ? resultWriteExecuted
        : entry.state === 'committed' || entry.state === 'pending_verification';
    const retryAllowed = entry.state === 'failed_before_execute';
    return {
        requestId: entry.requestId,
        operationKey,
        tool: entry.tool,
        action: entry.action,
        state: entry.state,
        writeExecuted,
        retryAllowed,
        targetIds: [...entry.targetIds],
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        ...(entry.result ? { result: entry.result } : {}),
        ...(isPendingWriteState(entry.state) ? { nextCall: writeStatusNextCall(entry.requestId) } : {}),
    };
}
