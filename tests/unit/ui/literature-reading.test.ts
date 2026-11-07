import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import * as siyuan from "siyuan";
import { buildPairMaps, correspondingScroll, intraBlockFraction, LiteratureReading } from "@/ui/literature/reading";
import type { TranslationProgress } from "@/ui/literature/desktop-runner";

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

describe("文献逐块配对表", () => {
    const source = "20261106150000-aaaaaaa";
    const translated = "20261106150001-bbbbbbb";
    it("由 attributes 行建立双向查找，并忽略无效标识", () => {
        const maps = buildPairMaps([
            { translationId: translated, sourceId: source },
            { translationId: "bad", sourceId: source },
            { translationId: translated, sourceId: "also-bad" },
        ]);
        expect(maps.sourceToTranslation.get(source)).toBe(translated);
        expect(maps.translationToSource.get(translated)).toBe(source);
        expect(maps.translationToSource.size).toBe(1);
    });
    it("兼容 block_id/value 列名并去重", () => {
        const maps = buildPairMaps([
            { block_id: translated, value: source },
            { block_id: translated, value: source },
        ]);
        expect(maps.translationToSource.size).toBe(1);
    });
});

describe("块内滚动比例", () => {
    it("计算视口顶部切入块内的比例并钳制", () => {
        expect(intraBlockFraction(100, 200, 150)).toBe(0.25);
        expect(intraBlockFraction(100, 200, 50)).toBe(0);
        expect(intraBlockFraction(100, 200, 400)).toBe(1);
        expect(intraBlockFraction(100, 0, 150)).toBe(0);
    });
});

describe("逐块配对进度上报", () => {
    const SRC = "20261101000000-aaaaaaa";
    const TR = "20261101000001-bbbbbbb";

    it("ensurePairs 以 pairing=true 开始，完成事件以 pairing=false 收尾", async () => {
        const progressCalls: Array<[TranslationProgress | null, boolean]> = [];
        const plugin = {
            canRunLiteraturePairing: () => true,
            pairLiteratureTranslation: async (_id: string, onProgress?: (progress: TranslationProgress) => void) => {
                onProgress?.({ stage: "写入逐块配对", completed: 50, total: 100, unit: "块" });
                onProgress?.({ stage: "逐块配对完成", done: true });
                return {};
            },
        };
        const reading = new LiteratureReading(
            plugin as any,
            () => ({ openAlongside: true, syncScroll: false }),
            () => {},
            undefined,
            (progress, pairing) => progressCalls.push([progress, pairing]),
        );
        await (reading as any).ensurePairs(SRC, TR);
        expect(progressCalls[0]).toEqual([{ stage: "正在建立逐块配对" }, true]);
        expect(progressCalls[1]?.[0]).toMatchObject({ stage: "写入逐块配对", completed: 50, total: 100, unit: "块" });
        expect(progressCalls[1]?.[1]).toBe(true);
        expect(progressCalls.at(-1)?.[0]).toMatchObject({ stage: "逐块配对完成", done: true });
        expect(progressCalls.at(-1)?.[1]).toBe(false);
    });
});

it("按归档口径核对原文，忽略零宽字符但拦住正文变化", async () => {
    const source = "20261106150000-aaaaaaa";
    const translation = "20261106150001-bbbbbbb";
    const hash = createHash("sha256").update("原文正文").digest("hex");
    let kramdown = '原文\u200B正文\n{: id="' + source + '"}';
    const kernel = vi.spyOn(siyuan, "fetchSyncPost").mockImplementation(async (url, data) => ({
        code: 0,
        data: url.endsWith("getBlockKramdown") ? { kramdown }
            : (data as { id: string }).id === source ? { "custom-literature-translation-id": translation }
                : { "custom-literature-original-id": source, "custom-literature-translation-source": hash },
    }));
    const reading = new LiteratureReading({ app: {} } as any, () => ({ openAlongside: true, syncScroll: true }), () => {});
    const pairing = vi.spyOn(reading as any, "ensurePairs").mockResolvedValue(undefined);
    vi.spyOn(reading as any, "loadPairs").mockResolvedValue(buildPairMaps([{ sourceId: source, translationId: translation }]));
    vi.spyOn(reading as any, "findEditor").mockReturnValue({});
    const bind = vi.spyOn(reading as any, "bind").mockReturnValue(true);
    try {
        await expect(reading.open(source, true)).resolves.toBeUndefined();
        expect(bind).toHaveBeenCalledTimes(1);
        kramdown = '原文正文\n{: id="20261106150002-ccccccc"}';
        await expect(reading.open(source, true)).rejects.toThrow("原文块标识已变化");
        kramdown = "原文新增一句";
        await expect(reading.open(source, true)).rejects.toThrow("原文在翻译后已变化");
        expect(pairing).toHaveBeenCalledTimes(2);
        expect(bind).toHaveBeenCalledTimes(1);
    } finally { kernel.mockRestore(); }
});
