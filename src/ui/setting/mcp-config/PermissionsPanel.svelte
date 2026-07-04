<script lang="ts">
    import SettingPanel from "../../shared/setting-panel.svelte";

    export let group: string;
    export let display = false;
    export let notebooks: NotebookInfo[] = [];
    export let permissions: Record<string, NotebookPermission> = {};
    export let permLoading = true;
    export let getLabel: (key: string, fallback: string) => string;
    export let onChanged: (event: CustomEvent<ChangeEvent>) => void | Promise<void>;

    interface NotebookInfo { id: string; name: string; closed?: boolean; }
    interface ChangeEvent { key: string; value: any; }
    type NotebookPermission = 'none' | 'r' | 'rw' | 'rwd';

    function buildNotebookItem(nb: NotebookInfo): ISettingItem {
        return {
            type: "select",
            key: `perm__${nb.id}`,
            value: permissions[nb.id] ?? "r",
            title: nb.name,
            description: getLabel("mcpPermDesc", "MCP 访问权限：无权限 / 只读 / 读写不可删除 / 读写可删除"),
            options: {
                none: getLabel("mcpPermNone", "禁止访问"),
                r: getLabel("mcpPermRead", "只读"),
                rw: getLabel("mcpPermReadWrite", "读写不可删除"),
                rwd: getLabel("mcpPermReadWriteDelete", "读写可删除"),
            },
        };
    }

    function buildPermItems(): ISettingItem[] {
        if (notebooks.length === 0) {
            return [{
                type: "hint",
                key: "perm__hint",
                value: permLoading ? getLabel("mcpPermLoading", "Loading notebooks...") : getLabel("mcpPermEmpty", "No notebooks found."),
                title: "",
                description: "",
            }];
        }

        return notebooks.filter((nb) => !nb.closed).map(buildNotebookItem);
    }

    function buildClosedPermItems(): ISettingItem[] {
        return notebooks.filter((nb) => nb.closed).map(buildNotebookItem);
    }

    let permItems: ISettingItem[] = [];
    let closedPermItems: ISettingItem[] = [];

    $: {
        notebooks;
        permissions;
        permLoading;
        getLabel;
        permItems = buildPermItems();
        closedPermItems = buildClosedPermItems();
    }
</script>

<SettingPanel {group} settingItems={permItems} {display} on:changed={onChanged} />
{#if display && closedPermItems.length > 0}
    <details class="closed-notebooks">
        <summary>
            {getLabel("mcpPermClosedGroup", "已关闭笔记本")} ({closedPermItems.length})
        </summary>
        <SettingPanel group={`${group}__closed`} settingItems={closedPermItems} display={true} on:changed={onChanged} />
    </details>
{/if}

<style>
    .closed-notebooks {
        margin-top: 12px;
    }

    .closed-notebooks > summary {
        box-sizing: border-box;
        color: var(--b3-theme-on-surface);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        line-height: 32px;
        list-style: revert;
        min-height: 32px;
        padding: 0 0 0 2px;
        user-select: none;
    }
</style>
