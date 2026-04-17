import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface, type Interface } from 'node:readline';

import { getDefaultConfigPath, type FileConfig } from './config';

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
            console.log('Aborted.');
            return;
        }
    }

    const p = new Prompter();
    try {
        console.log('This will create a config file for the siyuan CLI.');
        console.log('Press Enter to accept defaults shown in brackets.\n');

        const apiUrl = (await p.ask('SiYuan API URL [http://127.0.0.1:6806]: ')) || 'http://127.0.0.1:6806';
        const token = await p.ask('SiYuan API token (find it in SiYuan > Settings > About): ');

        const config: FileConfig = { apiUrl, token };

        const dir = dirname(target);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
        writeFileSync(target, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
        console.log(`\nWrote config to ${target}`);
        console.log('Try: siyuan notebook list');
    } finally {
        p.close();
    }
}
