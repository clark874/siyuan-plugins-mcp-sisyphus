export const MIN_OFFICIAL_MCP_VERSION = '3.7.0';

function numericVersionParts(version: string): [number, number, number] | undefined {
    const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/i);
    if (!match) return undefined;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function supportsOfficialMcp(version: string): boolean {
    const current = numericVersionParts(version);
    const minimum = numericVersionParts(MIN_OFFICIAL_MCP_VERSION)!;
    if (!current) return false;

    for (let index = 0; index < minimum.length; index += 1) {
        if (current[index] > minimum[index]) return true;
        if (current[index] < minimum[index]) return false;
    }
    return true;
}
