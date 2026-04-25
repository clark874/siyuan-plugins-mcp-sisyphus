import type { SiYuanResponse } from '../types/shared';

export interface SiYuanClientConfig {
    baseUrl?: string;
    timeout?: number;
}

export type { SiYuanResponse } from '../types/shared';

export class SiYuanClient {
    private baseUrl: string;
    private timeout: number;
    private token: string = '';

    constructor(config: SiYuanClientConfig = {}) {
        const rawBaseUrl = config.baseUrl
            || process.env.SIYUAN_API_URL
            || 'http://127.0.0.1:6806';
        this.baseUrl = rawBaseUrl.replace(/\/+$/, '');
        this.timeout = config.timeout || 30000;
    }

    setToken(token: string): void {
        this.token = token;
    }

    getBaseUrl(): string {
        return this.baseUrl;
    }

    getAuthHeaders(): Record<string, string> {
        const headers: Record<string, string> = {};
        if (this.token) {
            headers['Authorization'] = `Token ${this.token}`;
        }
        return headers;
    }

    private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, { ...init, signal: controller.signal });
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
            }
            return response;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request timeout after ${this.timeout}ms`);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async readRemoteFile(path: string): Promise<Response> {
        return this.fetchWithTimeout(`${this.baseUrl}/api/file/getFile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
            body: JSON.stringify({ path }),
        });
    }

    private async readData<T>(url: string, init: RequestInit): Promise<T> {
        const response = await this.fetchWithTimeout(url, init);
        const result: SiYuanResponse<T> = await response.json();
        if (result.code !== 0) {
            throw new Error(`SiYuan API error: ${result.code} - ${result.msg}`);
        }

        return result.data;
    }

    async readFile(path: string): Promise<string> {
        const response = await this.readRemoteFile(path);
        return await response.text();
    }

    async readFileBinary(path: string): Promise<Uint8Array> {
        const response = await this.readRemoteFile(path);
        return new Uint8Array(await response.arrayBuffer());
    }

    async writeFile(path: string, content: string): Promise<void> {
        const formData = new FormData();
        const file = new File([content], 'content');
        formData.append('path', path);
        formData.append('isDir', 'false');
        formData.append('modTime', String(Date.now()));
        formData.append('file', file);

        await this.requestFormData<null>('/api/file/putFile', formData);
    }

    async requestFormData<T>(endpoint: string, formData: FormData): Promise<T> {
        // Do not set Content-Type manually for FormData: fetch must add the multipart boundary.
        return this.readData<T>(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: formData,
        });
    }

    async request<T>(endpoint: string, data?: object): Promise<T> {
        return this.readData<T>(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
            body: JSON.stringify(data ?? {}),
        });
    }
}
