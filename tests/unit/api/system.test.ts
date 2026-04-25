import { describe, expect, it, vi } from 'vitest';

import { getCurrentTime, getVersion } from '@/api/system';

describe('system api wrappers', () => {
    it('requests the current SiYuan version', async () => {
        const request = vi.fn().mockResolvedValueOnce('3.1.0');
        const client = {
            request,
        } as never;

        await expect(getVersion(client)).resolves.toBe('3.1.0');
        expect(request).toHaveBeenCalledWith('/api/system/version');
    });

    it('requests the current SiYuan time', async () => {
        const request = vi.fn().mockResolvedValueOnce(1710000000000);
        const client = {
            request,
        } as never;

        await expect(getCurrentTime(client)).resolves.toBe(1710000000000);
        expect(request).toHaveBeenCalledWith('/api/system/currentTime');
    });
});
