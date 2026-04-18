import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface, type Interface } from 'node:readline';

import { getDefaultConfigPath, type FileConfig } from './config';
import { writeHeading, writeHint, writeKeyValueRows, writeStatus } from './render';

class Prompter {
    private rl: Interface;
    private closed = false;
    constructor() {
        this.rl = createInterface({ input: process.stdin, output: process.stdout });
        this.rl.once('close', () => { this.closed = true; });
    }
    ask(question: string): Promise<string> {
        if (this.closed) return Promise.resolve('');
        return new Promise((resolve) => {
            let done = false;
            const onClose = () => {
                if (done) return;
                done = true;
                resolve('');
            };
            this.rl.once('close', onClose);
            this.rl.question(question, (answer) => {
                if (done) return;
                done = true;
                this.rl.off('close', onClose);
                resolve(answer.trim());
            });
        });
    }
    close(): void {
        if (!this.closed) this.rl.close();
    }
}

export async function runInit(configPath?: string): Promise<void> {
    const target = configPath ?? getDefaultConfigPath();

    if (existsSync(target)) {
        const confirmer = new Prompter();
        const confirm = (await confirmer.ask(`Config already exists at ${target}. Overwrite? [y/N] `)).toLowerCase();
        confirmer.close();
        if (confirm !== 'y' && confirm !== 'yes') {
            writeStatus('warning', 'Aborted. Existing config was kept.');
            return;
        }
    }

    const p = new Prompter();
    try {
        writeHeading('SiYuan CLI setup');
        writeHint('Path', target);
        writeHint('Tip', 'Press Enter to accept the default shown in brackets.');
        process.stdout.write('\n');

        const apiUrl = (await p.ask('SiYuan API URL [http://127.0.0.1:6806]: ')) || 'http://127.0.0.1:6806';
        const token = await p.ask('SiYuan API token (find it in SiYuan > Settings > About): ');

        const config: FileConfig = { apiUrl, token };

        const dir = dirname(target);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
        writeFileSync(target, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
        process.stdout.write('\n');
        writeStatus('success', 'Config written.');
        writeKeyValueRows([
            { key: 'path', value: target },
            { key: 'apiUrl', value: apiUrl },
            { key: 'token', value: token ? 'configured' : 'empty' },
        ]);
        process.stdout.write('\n');
        writeHint('Next', 'Run `siyuan-sisyphus notebook list` to verify the connection. (`siyuan` also works.)');
    } finally {
        p.close();
    }
}
