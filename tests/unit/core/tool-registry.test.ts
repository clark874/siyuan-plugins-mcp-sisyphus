import { describe, expect, it } from 'vitest';

import { buildDefaultToolConfig } from '@/core/config';
import { listAllTools, USER_RULES_TOOL_DESCRIPTION_REMINDER } from '@/core/tool-registry';

describe('tool registry', () => {
    it('omits the user rules reminder when no user rules are configured', () => {
        const config = buildDefaultToolConfig();
        config.userRulesText = '';

        const tools = listAllTools(config);

        expect(tools.length).toBeGreaterThan(0);
        expect(tools.every((tool) => !tool.description?.includes(USER_RULES_TOOL_DESCRIPTION_REMINDER))).toBe(true);
    });

    it('adds a light user rules reminder when user rules are configured', () => {
        const config = buildDefaultToolConfig();
        config.userRulesText = 'Always set icons.';

        const tools = listAllTools(config);

        expect(tools.length).toBeGreaterThan(0);
        expect(tools.every((tool) => tool.description?.includes(USER_RULES_TOOL_DESCRIPTION_REMINDER))).toBe(true);
    });
});
