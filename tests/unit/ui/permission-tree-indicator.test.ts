import { describe, expect, it } from "vitest";

import {
    buildPermissionBadgeModel,
    getNextNotebookPermission,
    normalizeNotebookPermission,
    normalizeNotebookPermissions,
    type PermissionTreeLabels,
} from "@/ui/permission-tree-indicator";

const labels: PermissionTreeLabels = {
    names: {
        none: "无权限",
        r: "只读",
        rw: "读写不可删除",
        rwd: "读写可删除",
    },
    defaultSuffix: "（默认）",
    notebookScope: "应用于整个笔记本及其子文档",
    clickToChange: "点击切换权限",
};

describe("permission tree indicator", () => {
    it("uses read-only for missing or invalid notebook permissions", () => {
        expect(normalizeNotebookPermission(undefined)).toBe("r");
        expect(normalizeNotebookPermission("invalid")).toBe("r");
        expect(normalizeNotebookPermission("readonly")).toBe("r");
        expect(normalizeNotebookPermission("write")).toBe("rw");
    });

    it("normalizes a persisted notebook permission map", () => {
        expect(normalizeNotebookPermissions({
            alpha: "none",
            beta: "rw",
            gamma: "invalid",
        })).toEqual({
            alpha: "none",
            beta: "rw",
            gamma: "r",
        });
        expect(normalizeNotebookPermissions(null)).toEqual({});
    });

    it("marks an implicit read-only badge as the default", () => {
        expect(buildPermissionBadgeModel("r", false, labels)).toEqual({
            permission: "r",
            text: "R",
            title: "只读（默认）\n应用于整个笔记本及其子文档\n点击切换权限",
            explicit: false,
        });
    });

    it("renders all explicit permission codes without a default suffix", () => {
        expect(buildPermissionBadgeModel("none", true, labels).text).toBe("NONE");
        expect(buildPermissionBadgeModel("rw", true, labels).title).toBe("读写不可删除\n应用于整个笔记本及其子文档\n点击切换权限");
        expect(buildPermissionBadgeModel("rwd", true, labels).text).toBe("RWD");
    });

    it("cycles permissions in increasing-access order before returning to none", () => {
        expect(getNextNotebookPermission("none")).toBe("r");
        expect(getNextNotebookPermission("r")).toBe("rw");
        expect(getNextNotebookPermission("rw")).toBe("rwd");
        expect(getNextNotebookPermission("rwd")).toBe("none");
    });
});
