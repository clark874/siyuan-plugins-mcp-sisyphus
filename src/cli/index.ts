import { promises as fs } from 'node:fs';
import { lintMarkdown } from '../../agent-kit/scripts/markdown-lint.mjs';
import { getHelpText, parseArgs } from './args';
import { runConfigCommand } from './config-command';
import { runDispatch } from './dispatch';
import { runDoctor } from './doctor';
import { runInit } from './init';
import { runHelp, runList } from './list-help';
import { renderCliError } from './render';
import { runSkillCommand } from './skill-command';

declare const __CLI_VERSION__: string;

async function main(): Promise<number> {
    let cli;
    try {
        cli = parseArgs(process.argv.slice(2));
    } catch (error) {
        renderCliError(error);
        return 2;
    }

    switch (cli.command) {
        case 'show-help':
            process.stdout.write(getHelpText());
            return 0;
        case 'version':
            process.stdout.write(`${__CLI_VERSION__}\n`);
            return 0;
        case 'init':
            await runInit(cli.configPath);
            return 0;
        case 'config':
            return runConfigCommand(cli);
        case 'skill':
            return runSkillCommand(cli);
        case 'doctor':
            return await runDoctor(cli);
        case 'lint-markdown': {
            const [file] = cli.rest;
            let markdown: string;
            if (file === '-') {
                process.stdin.setEncoding('utf8');
                const chunks: string[] = [];
                for await (const chunk of process.stdin) chunks.push(chunk);
                markdown = chunks.join('');
            } else {
                markdown = await fs.readFile(file, 'utf8');
            }
            const diagnostics = lintMarkdown(markdown);
            const errors = diagnostics.filter(item => item.severity === 'error').length;
            if (cli.json) process.stdout.write(JSON.stringify({ ok: errors === 0, diagnostics }) + '\n');
            else if (diagnostics.length === 0) process.stdout.write('Markdown 预检通过。\n');
            else for (const item of diagnostics) {
                const level = item.severity === 'error' ? '错误' : '提示';
                process.stdout.write(`${level} 第 ${item.line} 行第 ${item.column} 列 [${item.rule}] ${item.hint}\n  ${item.snippet}\n`);
            }
            return errors > 0 ? 1 : 0;
        }
        case 'list':
            return await runList(cli);
        case 'help':
            return await runHelp(cli);
        case 'dispatch':
            return await runDispatch(cli);
        default:
            throw new Error(`Unknown command: ${String((cli as { command: string }).command)}`);
    }
}

main()
    .then((code) => process.exit(code))
    .catch((error) => {
        renderCliError(error, { debug: process.env.SIYUAN_MCP_DEBUG === '1' });
        process.exit(1);
    });
