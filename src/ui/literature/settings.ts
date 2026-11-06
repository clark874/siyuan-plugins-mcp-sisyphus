export const LITERATURE_PROFILE_FILE = "literature-profile.json";

export interface LiteratureProfile {
    siyuan: { notebook: string; parentID: string | null; avID: string };
    zotero: { baseUrl: string; apiKeyEnv: string };
    notebooklm: { enabled: boolean; profile: string; notebookTitle: string; notebookId: string; python: string };
    translation: {
        mode: "manual" | "automatic";
        openAlongside: boolean;
        syncScroll: boolean;
        executable: string;
        configPath: string;
    };
}

export const defaultLiteratureProfile = (): LiteratureProfile => ({
    siyuan: { notebook: "", parentID: null, avID: "" },
    zotero: { baseUrl: "", apiKeyEnv: "ZOTERO_API_KEY" },
    notebooklm: { enabled: false, profile: "", notebookTitle: "", notebookId: "", python: "python3" },
    translation: { mode: "manual", openAlongside: true, syncScroll: true, executable: "mdtx", configPath: "" },
});

const str = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function normalizeLiteratureProfile(raw: unknown): LiteratureProfile {
    const candidate = (raw && typeof raw === "object" ? raw : {}) as Partial<LiteratureProfile>;
    const { siyuan, zotero, notebooklm, translation } = candidate;
    return {
        siyuan: { notebook: str(siyuan?.notebook), parentID: str(siyuan?.parentID) || null, avID: str(siyuan?.avID) },
        zotero: { baseUrl: str(zotero?.baseUrl), apiKeyEnv: str(zotero?.apiKeyEnv) || "ZOTERO_API_KEY" },
        notebooklm: {
            enabled: notebooklm?.enabled === true,
            profile: str(notebooklm?.profile),
            notebookTitle: str(notebooklm?.notebookTitle),
            notebookId: str(notebooklm?.notebookId),
            python: str(notebooklm?.python) || "python3",
        },
        translation: {
            mode: translation?.mode === "automatic" ? "automatic" : "manual",
            openAlongside: translation?.openAlongside !== false,
            syncScroll: translation?.syncScroll !== false,
            executable: str(translation?.executable) || "mdtx",
            configPath: str(translation?.configPath),
        },
    };
}

const blockId = /^\d{14}-[a-z0-9]{7}$/;
const notebookId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const credentialEnv = /^[A-Za-z_][A-Za-z_0-9]*_(?:API_KEY|TOKEN)$/;

export function validateLiteratureProfile(profile: LiteratureProfile): void {
    const { siyuan, zotero, notebooklm, translation } = profile;
    if ([siyuan.notebook, siyuan.avID, siyuan.parentID].some(id => id && !blockId.test(id))) {
        throw new Error("笔记本、父文档和 AV 应使用思源标识。");
    }
    if (zotero.baseUrl && !/^https:\/\/api\.zotero\.org\/(?:users|groups)\/\d+\/?$/.test(zotero.baseUrl)) {
        throw new Error("Zotero 地址须为官方个人或群组文库地址。");
    }
    if (!credentialEnv.test(zotero.apiKeyEnv)) {
        throw new Error("密钥环境变量名须以 _API_KEY 或 _TOKEN 结尾。");
    }
    if (translation.configPath && !/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(translation.configPath)) {
        throw new Error("mdtx 配置文件须使用绝对路径。");
    }
    if (notebooklm.enabled && !notebooklm.notebookTitle) throw new Error("启用 NotebookLM 前请填写笔记本名称。");
    if (notebooklm.notebookId && !notebookId.test(notebooklm.notebookId)) throw new Error("NotebookLM 笔记本 ID 格式错误。");
    if (translation.mode === "automatic" && !translation.configPath) throw new Error("自动翻译需要 mdtx 配置文件。");
}
