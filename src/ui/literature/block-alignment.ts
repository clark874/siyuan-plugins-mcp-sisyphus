export interface AlignedBlock {
    id: string;
    kind: string;
}

export function pairTranslationBlocks(source: AlignedBlock[], target: AlignedBlock[]): Map<string, string> {
    if (source.length !== target.length || source.some((block, index) => block.kind !== target[index].kind)) {
        throw new Error("原文与译文的块结构不一致，请更新译文后再开启逐块联动。");
    }
    return new Map(source.map((block, index) => [block.id, target[index].id]));
}

export function readAlignmentBlocks(dom: string): AlignedBlock[] {
    const root = new DOMParser().parseFromString(dom, "text/html").body;
    const children = [...root.children] as HTMLElement[];
    if (children[0]?.dataset.type === "NodeThematicBreak") {
        const end = children.findIndex((element, index) => index > 0 && element.dataset.type === "NodeThematicBreak");
        if (end > 0 && children.slice(1, end).some(element => /postfix_cover_stripped|cover_source|cover_fields/.test(element.textContent))) {
            children.slice(0, end + 1).forEach(element => element.remove());
        }
    }
    return [...root.querySelectorAll<HTMLElement>("[data-node-id][data-type]")].filter(element => {
        if (element.dataset.type === "NodeDocument") return false;
        return !/^(?:机器译文对应原文 SHA-256：|原始MD SHA-256：|来源MD绝对路径[：:])/u.test(element.textContent.trim());
    }).map(element => {
        const kind = element.dataset.type;
        const immutable = kind === "NodeMathBlock" || kind === "NodeCodeBlock"
            ? element.querySelector("[contenteditable]")?.textContent?.trim() ?? "" : "";
        const shape = kind === "NodeTable" ? [...element.querySelectorAll("tr")].map(row => row.children.length).join(",") : "";
        return { id: element.dataset.nodeId, kind: [kind, element.dataset.subtype ?? "", shape, immutable].join("|") };
    });
}
