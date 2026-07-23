export type NotebookPermission = "none" | "r" | "rw" | "rwd";

export interface PermissionTreeLabels {
    names: Record<NotebookPermission, string>;
    defaultSuffix: string;
    notebookScope: string;
    clickToChange: string;
}

export interface PermissionBadgeModel {
    permission: NotebookPermission;
    text: string;
    title: string;
    explicit: boolean;
}

export const PERMISSION_TREE_BADGE_CLASS = "sisyphus-permission-tree-badge";
export const PERMISSION_TREE_ROOT_SELECTOR = "ul[data-url] > li[data-type=\"navigation-root\"]";
export const PERMISSION_TREE_CHANGED_EVENT = "sisyphus-permission-tree-changed";

const BADGE_TEXT: Record<NotebookPermission, string> = {
    none: "NONE",
    r: "R",
    rw: "RW",
    rwd: "RWD",
};

const VALID_PERMISSIONS = new Set<NotebookPermission>(["none", "r", "rw", "rwd"]);
const PERMISSION_CYCLE: NotebookPermission[] = ["none", "r", "rw", "rwd"];
const LEGACY_PERMISSIONS: Record<string, NotebookPermission> = {
    readonly: "r",
    write: "rw",
};

export function normalizeNotebookPermission(value: unknown): NotebookPermission {
    if (typeof value === "string" && VALID_PERMISSIONS.has(value as NotebookPermission)) {
        return value as NotebookPermission;
    }
    if (typeof value === "string" && LEGACY_PERMISSIONS[value]) {
        return LEGACY_PERMISSIONS[value];
    }
    return "r";
}

export function normalizeNotebookPermissions(raw: unknown): Record<string, NotebookPermission> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(raw as Record<string, unknown>)
            .filter(([notebookId]) => notebookId.length > 0)
            .map(([notebookId, permission]) => [notebookId, normalizeNotebookPermission(permission)]),
    );
}

export function getNextNotebookPermission(permission: NotebookPermission): NotebookPermission {
    const index = PERMISSION_CYCLE.indexOf(permission);
    return PERMISSION_CYCLE[(index + 1) % PERMISSION_CYCLE.length];
}

export function buildPermissionBadgeModel(
    permission: NotebookPermission,
    explicit: boolean,
    labels: PermissionTreeLabels,
): PermissionBadgeModel {
    const defaultSuffix = explicit ? "" : labels.defaultSuffix;
    return {
        permission,
        text: BADGE_TEXT[permission],
        title: `${labels.names[permission]}${defaultSuffix}\n${labels.notebookScope}\n${labels.clickToChange}`,
        explicit,
    };
}

function findDirectBadge(rootItem: Element): HTMLElement | null {
    for (const child of Array.from(rootItem.children)) {
        if (child.classList.contains(PERMISSION_TREE_BADGE_CLASS)) {
            return child as HTMLElement;
        }
    }
    return null;
}

export function decoratePermissionTree(
    root: ParentNode,
    permissions: Record<string, NotebookPermission>,
    labels: PermissionTreeLabels,
): number {
    let decorated = 0;
    const rootItems = root.querySelectorAll<HTMLElement>(PERMISSION_TREE_ROOT_SELECTOR);

    for (const rootItem of rootItems) {
        const notebookId = rootItem.parentElement?.getAttribute("data-url")?.trim() ?? "";
        if (!notebookId) continue;

        const explicit = Object.prototype.hasOwnProperty.call(permissions, notebookId);
        const model = buildPermissionBadgeModel(permissions[notebookId] ?? "r", explicit, labels);
        let badge = findDirectBadge(rootItem);
        if (!badge) {
            badge = document.createElement("button");
            badge.className = PERMISSION_TREE_BADGE_CLASS;
            badge.setAttribute("type", "button");
            const textElement = rootItem.querySelector(":scope > .b3-list-item__text");
            if (textElement) {
                textElement.insertAdjacentElement("afterend", badge);
            } else {
                rootItem.appendChild(badge);
            }
        }

        badge.textContent = model.text;
        badge.title = model.title;
        badge.dataset.permission = model.permission;
        badge.dataset.notebookId = notebookId;
        badge.classList.toggle(`${PERMISSION_TREE_BADGE_CLASS}--implicit`, !model.explicit);
        badge.setAttribute("aria-label", model.title.replace(/\n/g, "，"));
        rootItem.dataset.sisyphusMcpPermission = model.permission;
        decorated += 1;
    }

    return decorated;
}

export function clearPermissionTreeIndicators(root: ParentNode): void {
    root.querySelectorAll(`.${PERMISSION_TREE_BADGE_CLASS}`).forEach((badge) => badge.remove());
    root.querySelectorAll<HTMLElement>("[data-sisyphus-mcp-permission]").forEach((element) => {
        delete element.dataset.sisyphusMcpPermission;
    });
}
