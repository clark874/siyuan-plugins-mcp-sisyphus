import { Dialog, Protyle, fetchSyncPost, getAllEditor, openTab, type Plugin } from "siyuan";

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

function windowOf(editor: Editor) { return editor.element?.closest('[data-type="wnd"]'); }

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

function synchronize(left: ScrollPane, right: ScrollPane): () => void {
    const expected = new WeakMap<HTMLElement, number>();
    const registrations = [[left, right], [right, left]].map(([source, target]) => {
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
    return () => registrations.forEach(dispose => dispose());
}

export class LiteratureReading {
    private cleanup?: () => void;
    private readonly opening = new Set<string>();
    private generation = 0;
    private comparison?: { sourceId: string; dialog: Dialog };
    private pending?: { sourceId: string; translationId: string };
    private linked?: { sourceId: string; translationId: string; left: HTMLElement; right: HTMLElement };

    constructor(private readonly plugin: Plugin, private readonly preferences: () => { openAlongside: boolean; syncScroll: boolean }) {}

    private findEditor(id: string, within?: Element, exclude?: Element) {
        return getAllEditor().map(editor => editor.protyle as Editor).find(editor => {
            if (editorId(editor) !== id || !editor.element?.isConnected || !editor.element.getClientRects().length) return false;
            const layout = windowOf(editor);
            return Boolean(layout && (!within || layout === within) && layout !== exclude);
        });
    }

    async open(sourceId: string, explicit = false) {
        if ((!explicit && !this.preferences().openAlongside) || this.opening.has(sourceId) || !blockId.test(sourceId)
            || this.comparison?.sourceId === sourceId) return;
        const generation = this.generation;
        this.opening.add(sourceId);
        try {
            const attrs = await readLiteratureAttrs(sourceId);
            const translationId = attrs[translationAttribute];
            if (generation !== this.generation) return;
            if (!translationId || !blockId.test(translationId) || translationId === sourceId) {
                if (explicit) throw new Error("当前论文还没有归档译文。");
                return;
            }
            const reciprocal = await readLiteratureAttrs(translationId);
            if (generation !== this.generation) return;
            if (reciprocal["custom-literature-original-id"] !== sourceId) {
                if (explicit) throw new Error("译文配对已失效，请重新生成或更新。");
                return;
            }
            const active = document.querySelector('[data-type="wnd"].layout__wnd--active');
            if (!active || !this.findEditor(sourceId, active)) return;
            this.pending = { sourceId, translationId };
            if (!this.findEditor(translationId, undefined, active)) {
                // 已是横向布局最右窗格时，原生「向右打开」会改用当前窗格。
                const activeLeft = active.getBoundingClientRect().left;
                const hasLeft = [...(active.closest(".layout__center")?.querySelectorAll('[data-type="wnd"]') ?? [])]
                    .some(element => element.getClientRects().length && element.getBoundingClientRect().right <= activeLeft + 1);
                if (active.parentElement?.classList.contains("layout__wnd--right") && hasLeft) {
                    this.openComparison(sourceId, translationId);
                    return;
                }
                await openTab({ app: this.plugin.app, doc: { id: translationId, action: ["cb-get-all"] },
                    position: "right", keepCursor: true });
            }
            if (generation === this.generation) this.bind(sourceId, translationId);
        } finally {
            this.opening.delete(sourceId);
        }
    }

    private openComparison(sourceId: string, translationId: string) {
        this.comparison?.dialog.destroy();
        const editors: Protyle[] = [];
        const panes: ScrollPane[] = [];
        let stop: (() => void) | undefined;
        const dialog = new Dialog({
            title: "文献中英文对照",
            content: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;height:100%;background:var(--b3-border-color)"><section data-literature-pane style="min-width:0;background:var(--b3-theme-background)"></section><section data-literature-pane style="min-width:0;background:var(--b3-theme-background)"></section></div>',
            width: "min(1380px, 96vw)", height: "min(900px, 90vh)",
            destroyCallback: () => {
                stop?.();
                editors.forEach(editor => editor.destroy());
                if (this.comparison?.dialog === dialog) this.comparison = undefined;
            },
        });
        this.pending = undefined;
        this.comparison = { sourceId, dialog };
        dialog.element.querySelectorAll<HTMLElement>("[data-literature-pane]").forEach((element, index) => {
            const editor = new Protyle(this.plugin.app, element, {
                blockId: [sourceId, translationId][index], action: ["cb-get-all"],
                after: ready => {
                    if (this.comparison?.dialog !== dialog) return;
                    ready.disable();
                    panes[index] = pane(ready.protyle);
                    if (panes[0] && panes[1] && !stop && this.preferences().syncScroll) stop = synchronize(panes[0], panes[1]);
                },
            });
            editor.disable();
            editors.push(editor);
        });
    }

    onEditorLoaded(editor?: Editor) {
        const id = editorId(editor);
        if (!id) return;
        const pair = this.pending ?? this.linked;
        if (pair && (pair.sourceId === id || pair.translationId === id)) this.bind(pair.sourceId, pair.translationId);
        if (pair?.translationId !== id) void this.open(id).catch(() => {});
    }

    private bind(sourceId: string, translationId: string) {
        const source = this.findEditor(sourceId);
        const target = source && this.findEditor(translationId, undefined, windowOf(source));
        const left = source && pane(source), right = target && pane(target);
        if (!left || !right) return;
        if (this.linked?.left === left.scroll && this.linked.right === right.scroll) return;
        this.cleanup?.();
        this.pending = undefined;
        this.linked = { sourceId, translationId, left: left.scroll, right: right.scroll };
        if (this.preferences().syncScroll) this.cleanup = synchronize(left, right);
    }

    reset() {
        this.generation += 1;
        this.comparison?.dialog.destroy();
        this.cleanup?.();
        this.cleanup = undefined;
        this.linked = undefined;
        this.pending = undefined;
    }
}
