import { getHelpText, parseArgs } from './args';
import { runDispatch } from './dispatch';
import { runInit } from './init';
import { runHelp, runList } from './list-help';

declare const __CLI_VERSION__: string;

async function main(): Promise<number> {
    let cli;
    try {
        cli = parseArgs(process.argv.slice(2));
    } catch (error) {
        process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
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
        case 'list':
            return runList(cli);
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
        const msg = error instanceof Error ? error.message : String(error);
        process.stderr.write(`\x1b[31m✗ ${msg}\x1b[0m\n`);
        if (process.env.SIYUAN_MCP_DEBUG === '1' && error instanceof Error && error.stack) {
            process.stderr.write(error.stack + '\n');
        }
        process.exit(1);
    });
