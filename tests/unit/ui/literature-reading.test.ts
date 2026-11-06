import { describe, expect, it } from "vitest";
import { correspondingScroll } from "@/ui/literature/reading";

describe("文献对照滚动", () => {
    it("按章节定位，并保留两个方向的章节内位置", () => {
        const original = [0, 100, 400, 600];
        const translated = [0, 200, 350, 800];
        expect(correspondingScroll(250, original, translated)).toBe(275);
        expect(correspondingScroll(275, translated, original)).toBe(250);
        expect(correspondingScroll(600, original, translated)).toBe(800);
    });

    it("章节未完整加载时按滚动范围比例对齐", () => {
        expect(correspondingScroll(250, [0, 100, 500], [0, 900])).toBe(450);
        expect(correspondingScroll(0, [0, 0], [0, 900])).toBe(0);
    });
});

import { pairTranslationBlocks } from "@/ui/literature/block-alignment";

describe("文献正文块配对", () => {
    it("只为同一结构中的对应块建立双向标识依据", () => {
        const pairs = pairTranslationBlocks([{ id: "original", kind: "NodeParagraph" }], [{ id: "translated", kind: "NodeParagraph" }]);
        expect(pairs.get("original")).toBe("translated");
    });
    it("结构改变时拒绝把不同段落错误配对", () => {
        expect(() => pairTranslationBlocks([{ id: "original", kind: "NodeParagraph" }], [{ id: "translated", kind: "NodeHeading" }])).toThrow("块结构不一致");
    });
});
