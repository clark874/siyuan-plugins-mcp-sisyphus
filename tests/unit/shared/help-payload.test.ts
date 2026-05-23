import { describe, expect, it } from 'vitest';

import { isActionHelpPayload, isHelpIndexPayload } from '@/shared/help-payload';

describe('presentation/help-payload', () => {
    it('detects help index payloads', () => {
        expect(isHelpIndexPayload({
            tool: 'block',
            commonActions: ['append'],
            advancedActions: ['move'],
        })).toBe(true);
        expect(isHelpIndexPayload({
            tool: 'block',
            action: 'append',
        })).toBe(false);
    });

    it('detects action help payloads', () => {
        expect(isActionHelpPayload({
            tool: 'block',
            action: 'append',
            shapes: ['dataType + data + parentID'],
        })).toBe(true);
        expect(isActionHelpPayload({
            tool: 'document',
            action: 'create',
            examples: [{ title: 'Create by path', mcp: { action: 'create', notebook: 'nb', path: '/Doc' } }],
        })).toBe(true);
        expect(isActionHelpPayload({
            tool: 'block',
            action: 'append',
        })).toBe(false);
    });
});
