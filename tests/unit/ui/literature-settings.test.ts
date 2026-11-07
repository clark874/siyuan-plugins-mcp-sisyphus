import { describe, expect, it } from "vitest";
import {
    defaultLiteratureProfile, normalizeLiteratureProfile, validateLiteratureProfile,
} from "@/ui/literature/settings";

describe("文献翻译设置规范化", () => {
    it("旧配置中的 translation.apiKeyEnv 被静默丢弃", () => {
        const profile = normalizeLiteratureProfile({
            projectName: " PM ",
            translation: {
                mode: "automatic",
                openAlongside: false,
                syncScroll: false,
                executable: "/opt/mdtx/bin/mdtx",
                configPath: "/tmp/mdtx.yaml",
                apiKeyEnv: "DEEPSEEK_API_KEY",
            },
        });
        expect(profile.projectName).toBe("PM");
        expect(profile.translation).not.toHaveProperty("apiKeyEnv");
        expect(profile.translation).toMatchObject({
            mode: "automatic",
            openAlongside: false,
            syncScroll: false,
            executable: "/opt/mdtx/bin/mdtx",
            configPath: "/tmp/mdtx.yaml",
        });
    });

    it("缺省值与空输入回退到默认 profile", () => {
        expect(normalizeLiteratureProfile(null)).toEqual(defaultLiteratureProfile());
        expect(normalizeLiteratureProfile({ translation: "bad" }).translation.mode).toBe("manual");
    });

    it("自动翻译要求 mdtx 程序与配置绝对路径", () => {
        const profile = defaultLiteratureProfile();
        profile.translation.mode = "automatic";
        expect(() => validateLiteratureProfile(profile)).toThrow();
        profile.translation.executable = "mdtx";
        profile.translation.configPath = "relative/config.yaml";
        expect(() => validateLiteratureProfile(profile)).toThrow();
        profile.translation.configPath = "/tmp/config.yaml";
        expect(() => validateLiteratureProfile(profile)).not.toThrow();
    });
});
