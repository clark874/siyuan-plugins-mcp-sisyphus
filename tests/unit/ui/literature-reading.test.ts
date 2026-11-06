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
