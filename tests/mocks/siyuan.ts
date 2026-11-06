export class Plugin {
    name = 'siyuan-plugins-mcp-sisyphus';
    i18n: Record<string, string> = {};
    app = {};
    eventBus = {
        on(_type: string, _listener: (event: CustomEvent) => void) {},
        off(_type: string, _listener: (event: CustomEvent) => void) {},
    };

    addCommand(_options: { langKey: string; langText: string; hotkey: string; callback: () => void; editorCallback: (editor: unknown) => void }): void {}

    constructor(_options?: unknown) {}

    loadData(_name: string): Promise<unknown> {
        return Promise.resolve(undefined);
    }

    saveData(_name: string, _data: unknown): Promise<void> {
        return Promise.resolve();
    }

    removeData(_name: string): Promise<void> {
        return Promise.resolve();
    }
}

export class Dialog {
    element: HTMLElement;

    constructor(_options?: unknown) {
        this.element = document.createElement('div');
    }
    destroy(): void {}
}

export class Protyle {
    protyle = {};
    constructor(_app: unknown, _element: HTMLElement, _options: { blockId: string; action: string[]; render?: unknown; after: (ready: Protyle) => void }) {}
    disable(): void {}
    destroy(): void {}
}

export function showMessage(_message?: string, _timeout?: number, _type?: string): void {}

interface MockEditor {
    protyle?: {
        element?: HTMLElement;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export function getAllEditor(): MockEditor[] {
    return [];
}

export function confirm(_title: string, _message: string, _confirmed?: () => void): void {}
export async function fetchSyncPost(_url: string, _data?: unknown, _headers?: unknown, _process?: boolean, _signal?: AbortSignal): Promise<{ code: number; data: any }> {
    return { code: 0, data: {} };
}
export async function openTab(_options: unknown): Promise<void> {}
export function getAllTabs(_type?: string): unknown[] { return []; }
