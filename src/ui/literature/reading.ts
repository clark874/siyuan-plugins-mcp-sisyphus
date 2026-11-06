import { Protyle, fetchSyncPost, getAllEditor, openTab, type Plugin } from "siyuan";

import { literatureSourceMarkdown } from "../../../agent-kit/scripts/literature-source.mjs";
import { pairTranslationBlocks, readAlignmentBlocks } from "./block-alignment";

const blockId = /^\d{14}-[a-z0-9]{7}$/;
const translationAttribute = "custom-literature-translation-id";

type Editor = { block?: { rootID?: string; id?: string }; element?: HTMLElement; contentElement?: HTMLElement };
type ScrollPane = { scroll: HTMLElement; outline: () => HTMLElement[] };

function editorId(editor?: Editor) { return editor?.block?.rootID || editor?.block?.id; }

export async function readLiteratureAttrs(id: string): Promise<Record<string, string>> {
    if (!blockId.test(id)) return {};
    const response = await fetchSyncPost("/api/attr/getBlockAttrs", { id }, undefined, false, AbortSignal.timeout(5_000));
    if (response?.code !== 0) throw new Error("暂时无法读取论文配对信息。");
    return response.data ?? {};
}

function pane(editor: Editor): ScrollPane | undefined {
    const scroll = editor.contentElement ?? editor.element?.querySelector<HTMLElement>(".protyle-content");
    if (!scroll) return;
    return { scroll, outline: () => [...scroll.querySelectorAll<HTMLElement>(".protyle-wysiwyg > [data-type=NodeHeading]")] };
}

function maxScroll(scroll: HTMLElement) { return Math.max(0, scroll.scrollHeight - scroll.clientHeight); }

function coordinates(side: ScrollPane) {
    const { scroll } = side;
    const max = maxScroll(scroll), top = scroll.getBoundingClientRect().top;
    return [0, ...side.outline().map(block => Math.min(max, Math.max(0, block.getBoundingClientRect().top - top + scroll.scrollTop))), max];
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

function synchronize(left: ScrollPane, right: ScrollPane, pairs: Map<string, string>, onNotice: (message: string) => void, syncScroll: boolean): () => void {
    const highlighted = new Set<HTMLElement>();
    const reverse = new Map([...pairs].map(([source, target]) => [target, source]));
    const clickRegistrations = [[left, right, pairs], [right, left, reverse]].map(([source, target, map]) => {
        const from = source as ScrollPane, to = target as ScrollPane, mapping = map as Map<string, string>;
        const listener = (event: MouseEvent) => {
            const block = (event.target as Element)?.closest<HTMLElement>("[data-node-id][data-type]");
            if (!block || !from.scroll.contains(block)) return;
            const targetId = mapping.get(block.dataset.nodeId);
            if (!targetId) { onNotice("此块暂无经过结构校验的对应译文。"); return; }
            const counterpart = to.scroll.querySelector<HTMLElement>(`[data-node-id="${targetId}"]`);
            if (!counterpart) { onNotice("对应块尚未加载，请展开全文后重试。"); return; }
            highlighted.forEach(element => element.classList.remove("sisyphus-translation-highlight"));
            highlighted.clear();
            [block, counterpart].forEach(element => { element.classList.add("sisyphus-translation-highlight"); highlighted.add(element); });
            // 只改变目标栏的位置，避免点击高亮触发滚动回写。
            expected.set(to.scroll, Math.min(maxScroll(to.scroll), Math.max(0,
                counterpart.getBoundingClientRect().top - to.scroll.getBoundingClientRect().top + to.scroll.scrollTop - 72)));
            to.scroll.scrollTop = expected.get(to.scroll);
            onNotice("已定位对应原文与译文块。");
        };
        const keyboardClick = (event: MouseEvent) => listener(event);
        // 先于公式编辑器的默认点击处理保存原始块身份。
        from.scroll.addEventListener("pointerdown", listener, true);
        from.scroll.addEventListener("click", keyboardClick);
        return () => {
            from.scroll.removeEventListener("pointerdown", listener, true);
            from.scroll.removeEventListener("click", keyboardClick);
        };
    });
    const expected = new WeakMap<HTMLElement, number>();
    const registrations = (syncScroll ? [[left, right], [right, left]] : []).map(([source, target]) => {
        const listener = () => {
            const position = source.scroll.scrollTop;
            if (Math.abs((expected.get(source.scroll) ?? Infinity) - position) < 2) {
                expected.delete(source.scroll);
                return;
            }
            const sameOutline = source.outline().map(x => x.dataset.subtype).join() === target.outline().map(x => x.dataset.subtype).join();
            const next = correspondingScroll(position,
                sameOutline ? coordinates(source) : [0, maxScroll(source.scroll)],
                sameOutline ? coordinates(target) : [0, maxScroll(target.scroll)]);
            if (Math.abs(target.scroll.scrollTop - next) >= 2) {
                expected.set(target.scroll, next);
                target.scroll.scrollTop = next;
            }
        };
        source.scroll.addEventListener("scroll", listener, { passive: true });
        return () => source.scroll.removeEventListener("scroll", listener);
    });
    const invalidate = () => { pairs.clear(); reverse.clear(); onNotice("正文已编辑，请重新打开对照以核验配对。"); };
    left.scroll.addEventListener("input", invalidate);
    right.scroll.addEventListener("input", invalidate);
    return () => {
        left.scroll.removeEventListener("input", invalidate);
        right.scroll.removeEventListener("input", invalidate);
        [...registrations, ...clickRegistrations].forEach(dispose => dispose());
        highlighted.forEach(element => element.classList.remove("sisyphus-translation-highlight"));
    };
}

export class LiteratureReading {
    private cleanup?: () => void;
    private bound?: { source: HTMLElement; target: HTMLElement; pairs: Map<string, string> };
    private generation = 0;
    private requestVersion = 0;
    private readonly opening = new Set<string>();
    private comparison?: { sourceId: string; targetId: string; editor: Protyle; pairs: Map<string, string> };

    constructor(
        private readonly plugin: Plugin,
        private readonly preferences: () => { openAlongside: boolean; syncScroll: boolean },
        private readonly onNotice: (message: string) => void,
        private readonly getContainer: () => HTMLElement | null,
    ) {}

    private sourceEditor(id: string): Editor | undefined {
        return getAllEditor().map(editor => editor.protyle as Editor).find(editor => (
            editorId(editor) === id && editor.element?.isConnected && editor.element.getClientRects().length
            && editor.element.closest('[data-type="wnd"]')
        ));
    }

    async open(sourceId: string, explicit = false) {
        if (!blockId.test(sourceId) || this.opening.has(sourceId) || !explicit && !this.preferences().openAlongside) return;
        const generation = this.generation, requestVersion = ++this.requestVersion;
        const current = () => generation === this.generation && requestVersion === this.requestVersion;
        this.opening.add(sourceId);
        try {
            if (explicit) await openTab({ app: this.plugin.app, doc: { id: sourceId, action: ["cb-get-all", "cb-get-focus"] } });
            const attrs = await readLiteratureAttrs(sourceId);
            if (!current()) return;
            const targetId = attrs[translationAttribute];
            if (!blockId.test(targetId ?? "")) {
                if (explicit) throw new Error("当前论文还没有归档译文。");
                return;
            }
            const targetAttrs = await readLiteratureAttrs(targetId);
            if (!current()) return;
            if (targetAttrs["custom-literature-original-id"] !== sourceId) throw new Error("原文与译文的配对已失效，请更新译文。");
            const [left, right, markdown] = await Promise.all([
                fetchSyncPost("/api/block/getBlockDOM", { id: sourceId }, undefined, false, AbortSignal.timeout(10_000)),
                fetchSyncPost("/api/block/getBlockDOM", { id: targetId }, undefined, false, AbortSignal.timeout(10_000)),
                fetchSyncPost("/api/block/getBlockKramdown", { id: sourceId }, undefined, false, AbortSignal.timeout(10_000)),
            ]);
            if (!current()) return;
            if ([left, right, markdown].some(response => response.code !== 0)) throw new Error("无法回读原文与译文。");
            let pairs = new Map<string, string>();
            let notice: string;
            try {
                const bytes = new TextEncoder().encode(literatureSourceMarkdown(markdown.data.kramdown));
                const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
                if (targetAttrs["custom-literature-translation-source"] !== hash) throw new Error("译文与当前原文版本尚未核对，请更新译文后开启逐块联动。");
                pairs = pairTranslationBlocks(readAlignmentBlocks(left.data.dom), readAlignmentBlocks(right.data.dom));
                notice = `已核对 ${pairs.size} 对正文块，可双向点击定位。`;
            } catch (error) { notice = error.message; }
            if (!current() || !this.sourceEditor(sourceId)) return;
            const host = this.getContainer();
            if (!host || !current()) return;
            this.destroyComparison();
            this.onNotice(notice);
            const editor = new Protyle(this.plugin.app, host, {
                blockId: targetId, action: ["cb-get-all"],
                render: { background: false, title: true, gutter: false, breadcrumb: false },
                after: ready => {
                    if (!current()) return;
                    ready.disable();
                    this.bind(sourceId, ready.protyle, pairs);
                },
            });
            editor.disable();
            this.comparison = { sourceId, targetId, editor, pairs };
        } finally { this.opening.delete(sourceId); }
    }

    isOpen(sourceId: string): boolean { return this.comparison?.sourceId === sourceId; }

    private bind(sourceId: string, target: Editor, pairs: Map<string, string>) {
        const source = this.sourceEditor(sourceId);
        const left = source && pane(source), right = pane(target);
        if (!left || !right) return;
        if (this.bound?.source === left.scroll && this.bound.target === right.scroll && this.bound.pairs === pairs) return;
        this.cleanup?.();
        this.bound = { source: left.scroll, target: right.scroll, pairs };
        this.cleanup = synchronize(left, right, pairs, this.onNotice, this.preferences().syncScroll);
    }

    onEditorLoaded(editor?: Editor) {
        const id = editorId(editor);
        if (!id) return;
        if (this.comparison?.sourceId !== id && !this.opening.has(id)) this.requestVersion += 1;
        if (this.comparison?.sourceId === id) {
            this.bind(id, this.comparison.editor.protyle, this.comparison.pairs);
        } else {
            if (this.comparison && this.comparison.targetId !== id) this.destroyComparison();
            void this.open(id).catch(error => this.onNotice(error.message));
        }
    }

    private destroyComparison() {
        this.cleanup?.();
        this.cleanup = undefined;
        this.bound = undefined;
        this.comparison?.editor.destroy();
        this.comparison = undefined;
    }

    reset() {
        this.generation += 1;
        this.destroyComparison();
    }
}
