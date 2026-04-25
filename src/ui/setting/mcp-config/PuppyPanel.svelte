<script lang="ts">
    import SettingPanel from "../../shared/setting-panel.svelte";
    import { isDangerousAction, type MascotAction, type ToolConfig } from "../tool-config";
    import type { PuppySettings } from "../tool-config-storage";

    export let group: string;
    export let display = false;
    export let config: ToolConfig;
    export let puppySettings: PuppySettings;
    export let getLabel: (key: string, fallback: string) => string;
    export let onChanged: (event: CustomEvent<ChangeEvent>) => void | Promise<void>;

    interface ChangeEvent { key: string; value: any; }

    const mascotDefinition = {
        category: "mascot" as const,
        icon: "🐾",
        groupKey: "Mascot Tool",
        actions: [
            { key: "get_balance" as MascotAction, title: "Get Balance", description: "Get the mascot's current balance. Every successful MCP tool call earns 1 coin." },
            { key: "shop" as MascotAction, title: "Shop", description: "List the mascot shop inventory." },
            { key: "buy" as MascotAction, title: "Buy", description: "Buy one item from the mascot shop by item ID." },
        ],
    };

    const getDangerTitle = (title: string) => `${title} ${getLabel("mcpHighRiskBadge", "[High risk]")}`;
    const getDangerDescription = (description: string) => `${description} ${getLabel("mcpRequiresConfirmation", "Requires explicit user confirmation before execution.")} ${getLabel("mcpDefaultVisible", "This action stays visible in the default configuration.")}`;

    function buildPuppyItems(): ISettingItem[] {
        return [
            {
                type: "checkbox",
                key: "mascot__enabled",
                value: config.mascot.enabled,
                title: getLabel("mascot_tool_title", `${mascotDefinition.groupKey} Tool`),
                description: getLabel("mascot_tool_desc", "Expose the grouped mascot tool to MCP clients."),
            },
            ...mascotDefinition.actions.map((action) => {
                const baseTitle = getLabel(`mascot_action_${action.key}`, action.title);
                const baseDescription = getLabel(`desc_mascot_action_${action.key}`, action.description);
                const dangerous = isDangerousAction("mascot", action.key);
                return {
                    type: "checkbox" as const,
                    key: `mascot__action__${action.key}`,
                    value: config.mascot.actions[action.key],
                    title: dangerous ? getDangerTitle(baseTitle) : baseTitle,
                    description: dangerous ? getDangerDescription(baseDescription) : baseDescription,
                };
            }),
            {
                type: "checkbox",
                key: "puppy__visible",
                value: puppySettings.visible,
                title: getLabel("puppy_visible_title", "Show Mascot"),
                description: getLabel("puppy_visible_desc", "Show or hide the mascot on screen."),
            },
            {
                type: "checkbox",
                key: "puppy__showClickHint",
                value: puppySettings.showClickHint,
                title: getLabel("puppy_showClickHint_title", "Show Click Hint"),
                description: getLabel("puppy_showClickHint_desc", "Show a hint on click that this mascot is provided by the MCP plugin and can be turned off here."),
            },
            {
                type: "checkbox",
                key: "puppy__testModeEnabled",
                value: puppySettings.testModeEnabled,
                title: getLabel("puppy_testMode_title", "Random Mascot Test"),
                description: getLabel("puppy_testMode_desc", "Randomly cycle real MCP actions for animation testing without calling tools."),
                layout: "inline",
                children: [
                    ...(puppySettings.testModeEnabled
                        ? [{
                            type: "number" as const,
                            key: "puppy__testModeIntervalMs",
                            value: puppySettings.testModeIntervalMs,
                            title: getLabel("puppy_testMode_interval_title", "Interval"),
                            description: getLabel("puppy_testMode_interval_desc", "Delay between random test actions."),
                            inputCompact: true,
                            unit: "ms",
                        }]
                        : []),
                ],
            },
            {
                type: "checkbox",
                key: "puppy__showBubble",
                value: puppySettings.showBubble,
                title: getLabel("puppy_showBubble_title", "Show Bubble"),
                description: getLabel("puppy_showBubble_desc", "Show a pixel-style status bubble with tool-aware offsets and extra spacing for errors."),
            },
        ];
    }

    $: puppyItems = buildPuppyItems();
</script>

<SettingPanel {group} settingItems={puppyItems} {display} on:changed={onChanged} />
