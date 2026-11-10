import { fetchSyncPost, getAllEditor, getAllTabs, openTab, type Plugin, type Tab } from "siyuan";

import { literatureSourceMarkdown } from "../../../agent-kit/scripts/literature-source.mjs";
import { stripZeroWidthChars } from "../../core/normalize";
import { sha256Hex } from "../../shared/crypto";
import type { TranslationProgress } from "./desktop-runner";

const blockId = /^\d{14}-[a-z0-9]{7}$/;
const translationAttribute = "custom-literature-translation-id";
const originalAttribute = "custom-literature-original-id";
const sourceHashAttribute = "custom-literature-translation-source";
const pairAttribute = "custom-literature-source-block";

type Editor = { block?: { rootID?: string; id?: string }; element?: HTMLElement; contentElement?: HTMLElement };
type ScrollPane = { scroll: HTMLElement; blocks: () => HTMLElement[]; headings: () => HTMLElement[] };

export interface PairMaps {
    sourceToTranslation: Map<string, string>;
    translationToSource: Map<string, string>;
}

function editorId(editor?: Editor) { return editor?.block?.rootID || editor?.block?.id; }

export async function readLiteratureAttrs(id: string): Promise<Record<string, string>> {
    if (!blockId.test(id)) return {};
    const response = await fetchSyncPost("/api/attr/getBlockAttrs", { id }, undefined, false, AbortSignal.timeout(5_000));
    if (response?.code !== 0) throw new Error("暂时无法读取论文配对信息。");
    return response.data ?? {};
}

async function querySql(stmt: string): Promise<Record<string, unknown>[]> {
    const response = await fetchSyncPost("/api/query/sql", { stmt }, undefined, false, AbortSignal.timeout(8_000));
    if (response?.code !== 0 || !Array.isArray(response.data)) return [];
    return response.data as Record<string, unknown>[];
}

/** attributes 表行 → 双向配对表；无效行直接跳过。 */
export function buildPairMaps(rows: Array<Record<string, unknown>>): PairMaps {
    const sourceToTranslation = new Map<string, string>();
    const translationToSource = new Map<string, string>();
    for (const row of rows) {
        const translationId = String(row.translationId ?? row.block_id ?? "");
        const sourceId = String(row.sourceId ?? row.value ?? "");
        if (!blockId.test(translationId) || !blockId.test(sourceId)) continue;
        if (!translationToSource.has(translationId)) translationToSource.set(translationId, sourceId);
        if (!sourceToTranslation.has(sourceId)) sourceToTranslation.set(sourceId, translationId);
    }
    return { sourceToTranslation, translationToSource };
}

/** 锚点块被视口顶部切入的比例，钳制在 [0,1]。 */
export function intraBlockFraction(blockTop: number, blockHeight: number, viewportTop: number): number {
    if (blockHeight <= 0) return 0;
    return Math.min(1, Math.max(0, (viewportTop - blockTop) / blockHeight));
}

function pane(editor: Editor): ScrollPane | undefined {
    const scroll = editor.contentElement ?? editor.element?.querySelector<HTMLElement>(".protyle-content");
    if (!scroll) return;
    return {
        scroll,
        blocks: () => [...scroll.querySelectorAll<HTMLElement>(".protyle-wysiwyg [data-node-id]")]
            .filter(el => el.getClientRects().length > 0 && !el.querySelector("[data-node-id]")),
        headings: () => [...scroll.querySelectorAll<HTMLElement>(".protyle-wysiwyg > [data-type=NodeHeading]")],
    };
}

function maxScroll(scroll: HTMLElement) { return Math.max(0, scroll.scrollHeight - scroll.clientHeight); }

function coordinates(side: ScrollPane) {
    const { scroll } = side;
    const max = maxScroll(scroll), top = scroll.getBoundingClientRect().top;
    return [0, ...side.headings().map(block => Math.min(max, Math.max(0, block.getBoundingClientRect().top - top + scroll.scrollTop))), max];
}

/** 优先按对应章节对齐，当前加载窗口不匹配时使用全文位置比例。 */
export function correspondingScroll(position: number, source: number[], target: number[]): number {
    const maximum = source.at(-1) ?? 0;
    if (maximum <= 0) return 0;
    const targetMaximum = target.at(-1) ?? 0;
    if (source.length !== target.length) return Math.min(1, Math.max(0, position / maximum)) * targetMaximum;
    if (position >= maximum) return targetMaximum;
    const end = source.findIndex(point => point > position);
    if (end <= 0) return 0;
    const start = end - 1;
    const fraction = (position - source[start]) / (source[end] - source[start]);
    return target[start] + (target[end] - target[start]) * fraction;
}

function topmostVisible(side: ScrollPane): HTMLElement | null {
    const top = side.scroll.getBoundingClientRect().top;
    const blocks = side.blocks();
    for (const block of blocks) {
        if (block.getBoundingClientRect().bottom > top + 1) return block;
    }
    return blocks.at(-1) ?? null;
}

/** 对侧对应块按与锚点相同的块内比例对齐到视口顶部。 */
function anchorScrollTarget(anchor: HTMLElement, counterpart: HTMLElement, fromScroll: HTMLElement, toScroll: HTMLElement): number {
    const anchorRect = anchor.getBoundingClientRect();
    const counterpartRect = counterpart.getBoundingClientRect();
    const fraction = intraBlockFraction(anchorRect.top, anchorRect.height, fromScroll.getBoundingClientRect().top);
    const counterpartTop = counterpartRect.top - toScroll.getBoundingClientRect().top + toScroll.scrollTop;
    return Math.min(maxScroll(toScroll), Math.max(0, counterpartTop + fraction * counterpartRect.height));
}

async function waitForElement(find: () => HTMLElement | null | undefined, timeoutMs: number): Promise<HTMLElement | undefined> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const element = find();
        if (element) return element ?? undefined;
        if (Date.now() >= deadline) return undefined;
        await new Promise(resolve => setTimeout(resolve, 120));
    }
}

function synchronize(
    source: ScrollPane,
    target: ScrollPane,
    maps: PairMaps,
    app: Plugin["app"],
    onNotice: (message: string) => void,
    syncScroll: boolean,
): () => void {
    const highlighted = new Set<HTMLElement>();
    let owner: ScrollPane | undefined;
    let sequence = 0;
    let disposed = false;
    const claim = (side: ScrollPane) => { owner = side; sequence++; };
    const clearHighlight = () => {
        highlighted.forEach(element => element.classList.remove("sisyphus-translation-highlight"));
        highlighted.clear();
    };
    const mark = (elements: HTMLElement[]) => {
        clearHighlight();
        elements.forEach(element => { element.classList.add("sisyphus-translation-highlight"); highlighted.add(element); });
    };
    const findBlock = (side: ScrollPane, id: string) => {
        const block = side.scroll.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
        return block?.getClientRects().length ? block : undefined;
    };
    const scrollTo = (side: ScrollPane, element: HTMLElement, offset = 72) => {
        const next = Math.min(maxScroll(side.scroll), Math.max(0,
            element.getBoundingClientRect().top - side.scroll.getBoundingClientRect().top + side.scroll.scrollTop - offset));
        side.scroll.scrollTop = next;
    };

    // from 栏点击的块 → to 栏配对块；沿 DOM 向上找到最近的已配对块。
    const attachClick = (from: ScrollPane, to: ScrollPane, lookup: Map<string, string>, reversed: boolean) => {
        let down: { x: number; y: number } | null = null;
        let suppressClickUntil = 0;
        const counterpartIdOf = (block: HTMLElement): string | null => {
            let element: Element | null = block;
            while (element && from.scroll.contains(element)) {
                const counterpart = lookup.get(element.getAttribute("data-node-id") ?? "");
                if (counterpart) return counterpart;
                element = element.parentElement?.closest("[data-node-id]") ?? null;
            }
            return null;
        };
        const act = async (target: Element | null) => {
            claim(from);
            const request = sequence;
            const start = target?.closest?.("[data-node-id]") as HTMLElement | null;
            if (!start || !from.scroll.contains(start)) return;
            const counterpartId = counterpartIdOf(start);
            if (!counterpartId) { onNotice("此块暂无对应译文块。"); return; }
            let counterpart = findBlock(to, counterpartId);
            if (!counterpart) {
                // 对应块尚未渲染：交给思源定位并高亮后再取元素。
                try {
                    await openTab({ app, doc: { id: counterpartId, action: ["cb-get-context"] } });
                } catch { /* 尽力定位，失败时给出提示。 */ }
                counterpart = await waitForElement(() => findBlock(to, counterpartId), 2_000);
            }
            if (disposed || request !== sequence) return;
            if (!counterpart) { onNotice("对应块尚未加载，请展开后重试。"); return; }
            const anchor = findBlock(from, start.dataset.nodeId ?? "") ?? start;
            mark([anchor, counterpart]);
            scrollTo(to, counterpart);
            onNotice(reversed ? "已定位对应译文与原文块。" : "已定位对应原文与译文块。");
        };
        const onPointerDown = (event: PointerEvent) => {
            down = { x: event.clientX, y: event.clientY };
            // 公式块会吞掉 click 事件，按下时直接处理。
            if ((event.target as Element | null)?.closest?.('[data-type="NodeMathBlock"]')) {
                suppressClickUntil = Date.now() + 400;
                void act(event.target as Element | null);
            }
        };
        const onClick = (event: MouseEvent) => {
            if (Date.now() < suppressClickUntil) { down = null; return; }
            const moved = down ? Math.hypot(event.clientX - down.x, event.clientY - down.y) : 0;
            down = null;
            if (moved >= 4) return;
            void act(event.target as Element | null);
        };
        from.scroll.addEventListener("pointerdown", onPointerDown, true);
        from.scroll.addEventListener("click", onClick);
        return () => {
            from.scroll.removeEventListener("pointerdown", onPointerDown, true);
            from.scroll.removeEventListener("click", onClick);
        };
    };

    const attachScroll = (from: ScrollPane, to: ScrollPane, lookup: Map<string, string>) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const takeControl = () => claim(from);
        const listener = () => {
            // 只有用户操作的一侧驱动同步，避免对侧定位、图片重排触发反向拉回。
            if (owner && owner !== from) return;
            owner = from;
            const request = ++sequence;
            clearTimeout(timer);
            timer = setTimeout(async () => {
                if (disposed || request !== sequence) return;
                const anchor = topmostVisible(from);
                const counterpartId = anchor ? lookup.get(anchor.dataset.nodeId ?? "") : undefined;
                let counterpart = counterpartId ? findBlock(to, counterpartId) : undefined;
                if (anchor && counterpartId && !counterpart) {
                    try {
                        // 使用上下文分页，不聚焦对侧，也不关闭原生动态加载。
                        await openTab({ app, doc: { id: counterpartId, action: ["cb-get-context"] } });
                        counterpart = await waitForElement(() => findBlock(to, counterpartId), 2_000);
                    } catch { return; }
                }
                if (disposed || request !== sequence) return;
                // 有逐块配对时不能用局部窗口的比例冒充全文位置。
                if (anchor && counterpart) {
                    to.scroll.scrollTop = anchorScrollTarget(anchor, counterpart, from.scroll, to.scroll);
                } else if (!lookup.size) {
                    to.scroll.scrollTop = correspondingScroll(from.scroll.scrollTop, coordinates(from), coordinates(to));
                }
            }, 80);
        };
        const intentEvents = ["pointerdown", "wheel", "touchstart", "keydown"];
        intentEvents.forEach(event => from.scroll.addEventListener(event, takeControl, { passive: true, capture: true }));
        from.scroll.addEventListener("scroll", listener, { passive: true });
        return () => {
            clearTimeout(timer);
            from.scroll.removeEventListener("scroll", listener);
            intentEvents.forEach(event => from.scroll.removeEventListener(event, takeControl, true));
        };
    };

    const disposers = [
        attachClick(source, target, maps.sourceToTranslation, false),
        attachClick(target, source, maps.translationToSource, true),
        ...(syncScroll ? [attachScroll(source, target, maps.sourceToTranslation), attachScroll(target, source, maps.translationToSource)] : []),
    ];
    return () => {
        disposed = true;
        sequence++;
        disposers.forEach(dispose => dispose());
        clearHighlight();
    };
}

export class LiteratureReading {
    private cleanup?: () => void;
    private bound?: { sourceId: string; targetId: string; maps: PairMaps; left: HTMLElement; right: HTMLElement };
    private comparison?: { sourceId: string; targetId: string };
    private generation = 0;
    private readonly requestVersions = new Map<string, number>();
    private readonly opening = new Set<string>();
    private readonly autoOpened = new Set<string>();

    constructor(
        private readonly plugin: Plugin,
        private readonly preferences: () => { openAlongside: boolean; syncScroll: boolean },
        private readonly onNotice: (message: string) => void,
        private readonly onComparisonChange?: () => void,
        private readonly onProgress?: (progress: TranslationProgress | null, pairing: boolean) => void,
    ) {}

    private findEditor(id: string): Editor | undefined {
        return getAllEditor().map(editor => editor.protyle as Editor).find(editor => (
            editorId(editor) === id && editor.element?.isConnected && editor.element.getClientRects().length
            && editor.element.closest('[data-type="wnd"]')
        ));
    }

    private async waitForEditor(id: string, timeoutMs: number, generation: number): Promise<Editor | undefined> {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const editor = this.findEditor(id);
            if (editor) return editor;
            if (Date.now() >= deadline || generation !== this.generation) return undefined;
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    }

    private async pairingCount(translationId: string): Promise<number> {
        const rows = await querySql(
            `SELECT COUNT(*) AS count FROM attributes WHERE name='${pairAttribute}' AND root_id='${translationId}'`);
        const first = rows[0];
        return first ? Number(Object.values(first)[0] ?? 0) || 0 : 0;
    }

    private async loadPairs(translationId: string): Promise<PairMaps> {
        const rows = await querySql(
            `SELECT block_id AS translationId, value AS sourceId FROM attributes WHERE name='${pairAttribute}' AND root_id='${translationId}' LIMIT 20000`);
        return buildPairMaps(rows);
    }

    private async ensurePairs(sourceId: string, targetId: string) {
        try {
            if (await this.pairingCount(targetId) > 0) return;
        } catch { /* 计数失败按无配对继续。 */ }
        const plugin = this.plugin as unknown as {
            canRunLiteraturePairing?: () => boolean;
            pairLiteratureTranslation?: (documentId: string, onProgress?: (progress: TranslationProgress) => void) => Promise<unknown>;
        };
        if (typeof plugin.canRunLiteraturePairing !== "function" || !plugin.canRunLiteraturePairing()
            || typeof plugin.pairLiteratureTranslation !== "function") {
            this.onNotice("译文缺少逐块配对属性，点击定位不可用；请在思源桌面客户端开启对照以自动建立配对。");
            return;
        }
        this.onNotice("正在建立逐块配对…");
        this.onProgress?.({ stage: "正在建立逐块配对" }, true);
        try {
            await plugin.pairLiteratureTranslation(sourceId, progress => {
                this.onProgress?.(progress, progress.done !== true);
            });
        } catch (error) {
            this.onProgress?.(null, false);
            this.onNotice(`逐块配对未完成：${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        try {
            if (await this.pairingCount(targetId) === 0) this.onNotice("逐块配对写入后仍未检索到，请稍后重试。");
        } catch { /* 回读失败不阻断对照。 */ }
    }

    async open(sourceId: string, explicit = false) {
        if (!blockId.test(sourceId)) return;
        const generation = this.generation;
        let attrs = await readLiteratureAttrs(sourceId);
        if (generation !== this.generation) return;
        // 传入译文 id 时回到原文，原文始终在左；自动对照只针对原文文档。
        const fromTranslation = Boolean(attrs[originalAttribute] && blockId.test(attrs[originalAttribute]));
        if (fromTranslation) {
            sourceId = attrs[originalAttribute];
            attrs = await readLiteratureAttrs(sourceId);
            if (generation !== this.generation) return;
        }
        const targetId = attrs[translationAttribute];
        if (!blockId.test(targetId ?? "")) {
            if (explicit) throw new Error("当前论文还没有归档译文。");
            return;
        }
        if (this.opening.has(sourceId)) return;
        if (!explicit && (fromTranslation || this.autoOpened.has(sourceId) || this.comparison?.sourceId === sourceId)) return;
        if (!explicit && !this.preferences().openAlongside) return;
        // 版本号按原文计数：译文编辑器加载触发的重复 open 会在上方去重返回，
        // 不能让它作废仍在进行的首次打开。
        const requestVersion = (this.requestVersions.get(sourceId) ?? 0) + 1;
        this.requestVersions.set(sourceId, requestVersion);
        const current = () => generation === this.generation && this.requestVersions.get(sourceId) === requestVersion;
        this.opening.add(sourceId);
        try {
            if (explicit) {
                await openTab({ app: this.plugin.app, doc: { id: sourceId, action: ["cb-get-focus"] } });
            }
            if (!current()) return;
            const sourceBlocks = await this.verifySource(sourceId, targetId);
            if (!current()) return;
            await this.ensurePairs(sourceId, targetId);
            if (!current()) return;
            const maps = await this.loadPairs(targetId);
            if (!current()) return;
            this.checkPairSources(maps, sourceBlocks);
            const originalEditor = this.findEditor(sourceId) ?? await this.waitForEditor(sourceId, 4_000, generation);
            if (!current()) return;
            const originalTab = originalEditor?.element && (getAllTabs("Editor") as Tab[]).find(tab =>
                tab.panelElement.contains(originalEditor.element!));
            // 原生 right 会复用既有右窗格；原文已在最右侧时，两文会落在同一窗格。
            // 此时直接通过原生布局接口拆分并移动译文页签，保留原文及其他页签。
            if (!this.findEditor(targetId)) {
                await openTab({ app: this.plugin.app, doc: { id: targetId, action: ["cb-get-focus"] }, position: "right", openNewTab: true });
                const translatedEditor = await this.waitForEditor(targetId, 8_000, generation);
                if (!current()) return;
                const translatedTab = translatedEditor?.element && (getAllTabs("Editor") as Tab[]).find(tab =>
                    tab.panelElement.contains(translatedEditor.element!));
                if (originalTab && translatedTab?.parent === originalTab.parent) {
                    const right = originalTab.parent.split("lr");
                    right.headersElement.append(translatedTab.headElement);
                    right.moveTab(translatedTab);
                    originalTab.parent.switchTab(originalTab.headElement);
                }
            }
            if (!current()) return;
            const targetEditor = await this.waitForEditor(targetId, 8_000, generation);
            const sourceEditor = this.findEditor(sourceId) ?? await this.waitForEditor(sourceId, 4_000, generation);
            if (!current()) return;
            if (!targetEditor || !sourceEditor) {
                if (explicit) throw new Error("译文编辑器未能打开，请稍后重试。");
                return;
            }
            // 等待窗格期间，原文仍可能在另一个编辑器中被保存。
            this.checkPairSources(maps, await this.verifySource(sourceId, targetId));
            if (!current()) return;
            if (!this.bind(sourceId, targetId, sourceEditor, targetEditor, maps)) {
                if (explicit) throw new Error("译文编辑器尚未完成渲染，请稍后重试。");
                return;
            }
            this.comparison = { sourceId, targetId };
            this.autoOpened.add(sourceId);
            this.onComparisonChange?.();
            if (!maps.sourceToTranslation.size) this.onNotice("已开启双屏阅读。逐块定位需在可补建配对的桌面客户端完成。");
            else if (explicit) this.onNotice("已开启双屏对照：原文在左、译文在右。");
        } catch (error) {
            if (current() && this.comparison?.sourceId === sourceId) this.invalidateComparison();
            throw error;
        } finally {
            this.opening.delete(sourceId);
        }
    }

    isOpen(sourceId: string): boolean { return this.comparison?.sourceId === sourceId; }

    private async verifySource(sourceId: string, targetId: string): Promise<Set<string>> {
        const [attrs, response] = await Promise.all([
            readLiteratureAttrs(targetId),
            fetchSyncPost("/api/block/getBlockKramdown", { id: sourceId }, undefined, false, AbortSignal.timeout(10_000)),
        ]);
        if (attrs[originalAttribute] !== sourceId) throw new Error("原文与译文的配对已失效，请更新译文。");
        if (response?.code !== 0 || typeof response.data?.kramdown !== "string") throw new Error("暂时无法核对译文与原文版本。");
        // 与 MCP 的 get_kramdown 使用同一归一化规则。
        const kramdown = stripZeroWidthChars(response.data.kramdown);
        if (attrs[sourceHashAttribute] !== sha256Hex(literatureSourceMarkdown(kramdown))) {
            throw new Error("原文在翻译后已变化，请更新译文再开启对照。");
        }
        return new Set([...kramdown.matchAll(/\{:[^\r\n]*?[ \t]id="(\d{14}-[a-z0-9]{7})"[^\r\n]*?\}/gu)].map(match => match[1]));
    }

    private checkPairSources(maps: PairMaps, sourceBlocks: Set<string>) {
        if ([...maps.translationToSource.values()].some(id => !sourceBlocks.has(id))) {
            throw new Error("原文块标识已变化，请核对译文配对后再开启对照。");
        }
    }

    private bind(sourceId: string, targetId: string, source: Editor, target: Editor, maps: PairMaps): boolean {
        const left = pane(source), right = pane(target);
        if (!left || !right) return false;
        this.unbind();
        this.bound = { sourceId, targetId, maps, left: left.scroll, right: right.scroll };
        const cleanup = synchronize(left, right, maps, this.plugin.app, this.onNotice, this.preferences().syncScroll);
        const onInput = () => {
            this.invalidateComparison();
            this.onNotice("正文已编辑，配对已暂停。请重新开启以核对当前版本。");
        };
        left.scroll.addEventListener("input", onInput);
        right.scroll.addEventListener("input", onInput);
        this.cleanup = () => {
            left.scroll.removeEventListener("input", onInput);
            right.scroll.removeEventListener("input", onInput);
            cleanup();
        };
        return true;
    }

    private unbind() {
        this.cleanup?.();
        this.cleanup = undefined;
        this.bound = undefined;
    }

    private invalidateComparison() {
        this.unbind();
        this.comparison = undefined;
        this.onComparisonChange?.();
    }

    onEditorLoaded(editor?: Editor) {
        const id = editorId(editor);
        if (!id) return;
        const comparison = this.comparison;
        if (comparison && (id === comparison.sourceId || id === comparison.targetId)) {
            if (!this.bound) return;
            void this.verifySource(comparison.sourceId, comparison.targetId).then(async sourceBlocks => {
                const maps = await this.loadPairs(comparison.targetId);
                if (this.comparison !== comparison) return;
                this.checkPairSources(maps, sourceBlocks);
                const source = this.findEditor(comparison.sourceId);
                const target = this.findEditor(comparison.targetId);
                if (source && target && this.bound?.left === pane(source)?.scroll
                    && this.bound?.right === pane(target)?.scroll) return;
                if (!source || !target || !this.bind(comparison.sourceId, comparison.targetId, source, target, maps)) {
                    this.invalidateComparison();
                }
            }).catch(error => {
                if (this.comparison !== comparison) return;
                this.invalidateComparison();
                this.onNotice(error.message);
            });
            return;
        }
        if (this.opening.has(id)) return;
        void this.open(id).catch(error => this.onNotice(error.message));
    }

    onEditorDestroyed(editor?: Editor) {
        const id = editorId(editor);
        const bound = this.bound;
        const comparison = this.comparison;
        const affected = id
            ? (bound && (id === bound.sourceId || id === bound.targetId))
                || (comparison && (id === comparison.sourceId || id === comparison.targetId))
            : Boolean(bound && (!bound.sourceId || !this.findEditor(bound.sourceId) || !this.findEditor(bound.targetId)));
        if (!affected) return;
        this.unbind();
        // 任一侧编辑器销毁即视为对照关闭；另一侧保留为普通标签页。
        this.comparison = undefined;
        this.onComparisonChange?.();
    }

    close(sourceId: string) {
        const comparison = this.comparison;
        if (!comparison || comparison.sourceId !== sourceId) return;
        this.unbind();
        this.comparison = undefined;
        this.onComparisonChange?.();
        this.closeEditorTab(comparison.targetId);
    }

    private closeEditorTab(id: string) {
        try {
            const tabs = getAllTabs("Editor") as Array<Record<string, any>>;
            for (const tab of tabs) {
                const model = tab?.model ?? {};
                const rootId = model?.protyle?.block?.rootID
                    ?? model?.protyle?.protyle?.block?.rootID
                    ?? model?.block?.rootID
                    ?? model?.editor?.protyle?.block?.rootID;
                if (rootId === id && typeof tab.close === "function") {
                    tab.close();
                    return;
                }
            }
        } catch { /* 尽力关闭，失败时仅解除绑定。 */ }
    }

    reset() {
        this.generation += 1;
        this.unbind();
        this.comparison = undefined;
        this.autoOpened.clear();
        this.requestVersions.clear();
    }
}
