export interface SiYuanClientConfig {
    baseUrl?: string;
    timeout?: number;
}

export interface SiYuanResponse<T = any> {
    code: number;
    msg: string;
    data: T;
}

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

    async readFile(path: string): Promise<string> {
        const response = await this.fetchWithTimeout(`${this.baseUrl}/api/file/getFile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
            body: JSON.stringify({ path }),
        });
        return await response.text();
    }

    async readFileBinary(path: string): Promise<Uint8Array> {
        const response = await this.fetchWithTimeout(`${this.baseUrl}/api/file/getFile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
            body: JSON.stringify({ path }),
        });
        return new Uint8Array(await response.arrayBuffer());
    }

    async writeFile(path: string, content: string): Promise<void> {
        const formData = new FormData();
        const file = new File([content], 'content');
        formData.append('path', path);
        formData.append('isDir', 'false');
        formData.append('modTime', String(Date.now()));
        formData.append('file', file);

        const response = await this.fetchWithTimeout(`${this.baseUrl}/api/file/putFile`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: formData,
        });

        const result: SiYuanResponse = await response.json();
        if (result.code !== 0) {
            throw new Error(`SiYuan API error: ${result.code} - ${result.msg}`);
        }
    }

    async request<T>(endpoint: string, data?: object): Promise<T> {
        const response = await this.fetchWithTimeout(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
            body: JSON.stringify(data ?? {}),
        });

        const result: SiYuanResponse<T> = await response.json();
        if (result.code !== 0) {
            throw new Error(`SiYuan API error: ${result.code} - ${result.msg}`);
        }

        return result.data;
    }
}
