import { Command, Option } from "./interface";

const ROW_INDENT = '    ';
const HIDDEN_OPTIONS = new Set(['help', 'json', 'verbose']);

const OPTION_COLUMN_WIDTH = 25;
const OPTION_DESCRIPTION_PAD = ROW_INDENT + ' '.repeat(OPTION_COLUMN_WIDTH);

/**
 * Example output:
 *
 * ```
 * Usage:
 *     ...
 *     filesystem upload [-c STRATEGY] [-f STRATEGY] [-d STRATEGY] [-t] localPath... parentPath
 *     ...
 *
 * General options:
 *     -h|--help: Show extended help for a command
 *     -j|--json: Output in JSON format
 *     -v|--verbose: Enable verbose output
 * ```
 */
export function printUsage(commands: Command[]) {
    console.log('Usage:');
    for (const command of commands) {
        printCommandSynopsisLine(command);
    }

    console.log('');
    console.log('General options:');
    console.log(`${ROW_INDENT}-h|--help: Show extended help for a command`);
    console.log(`${ROW_INDENT}-j|--json: Output in JSON format`);
    console.log(`${ROW_INDENT}-v|--verbose: Enable verbose output`);
}

/**
 * Example output:
 *
 * ```
 * Usage:
 *     filesystem upload [-c STRATEGY] [-f STRATEGY] [-d STRATEGY] [-t] localPath... parentPath
 *
 * Options:
 *     -c, --conflict-strategy STRATEGY
 *                                   Conflict strategy applied to all files and folders
 *                                   Values: merge, keep-both, replace, skip.
 *     ...
 * ```
 */
export function printCommandUsage(command: Command) {
    console.log('Usage:');
    printCommandSynopsisLine(command);

    if (command.help) {
        console.log('');
        wrapText(command.help, 80).forEach((line) => console.log(line));
    }

    const opts = visibleOptions(command);
    if (opts.length) {
        console.log('');
        console.log('Options:');
        for (const [name, opt] of opts) {
            printOptionManualRow(name, opt);
        }
    }

    const hasPath = command.args?.find((arg) => arg.includes('path'));
    if (hasPath) {
        printPathsHelp();
    }
}

function printPathsHelp() {
    console.log('');
    console.log('Remote paths:');
    console.log(`${ROW_INDENT}Posix paths are always used, regardless of the host OS.`);
    console.log(`${ROW_INDENT}Node names are used for paths if available. When name cannot be decrypted`);
    console.log(`${ROW_INDENT}or conflicts with other node(s), node UIDs can be used instead.`);
    console.log(`${ROW_INDENT}Escape / in node names with a backslash.`);
    console.log(``);
    console.log(`${ROW_INDENT}Examples:`);
    console.log(`${ROW_INDENT}- /my-files/folder/file.txt`);
    console.log(`${ROW_INDENT}- /my-files/folder/foo\\/bar`);
    console.log(`${ROW_INDENT}- /shared-with-me/NODE-UID/file.txt`);
}

function printCommandSynopsisLine(command: Command) {
    const body = buildCommandSynopsis(command);
    console.log(`${ROW_INDENT}${command.group} ${command.name}${body ? ` ${body}` : ''}`);
}

function buildCommandSynopsis(command: Command): string {
    const positionals = command.args || [];
    const optionParts = visibleOptions(command).map(([name, opt]) => buildCommandSynopsisOption(name, opt));
    return [...optionParts, ...positionals].filter(Boolean).join(' ');
}

function buildCommandSynopsisOption(longName: string, opt: Option): string {
    const optional = opt.default !== undefined;

    let token = opt.short ? `-${opt.short}` : `--${longName}`;
    if (opt.type === 'string') {
        const meta = getOptionVariableName(longName);
        token += ` ${meta}`;
        if (opt.multiple) {
            token += '...';
        }
    }
    return optional ? `[${token}]` : token;
}

function printOptionManualRow(longName: string, opt: Option) {
    const synopsis = buildCommandSynopsisOptionColumn(longName, opt);
    const description = buildCommandOptionDescription(opt);
    const descriptionWidth = Math.max(24, 80 - OPTION_DESCRIPTION_PAD.length);
    const descriptionLines = wrapText(description, descriptionWidth);

    if (synopsis.length > OPTION_COLUMN_WIDTH) {
        console.log(`${ROW_INDENT}${synopsis}`);
        for (const line of descriptionLines) {
            console.log(`${OPTION_DESCRIPTION_PAD}${line}`);
        }
        return;
    }

    console.log(`${ROW_INDENT}${synopsis.padEnd(OPTION_COLUMN_WIDTH)}${descriptionLines[0] ?? ''}`);
    for (let i = 1; i < descriptionLines.length; i++) {
        console.log(`${OPTION_DESCRIPTION_PAD}${descriptionLines[i]}`);
    }
}

function buildCommandSynopsisOptionColumn(longName: string, opt: Option): string {
    let spec = opt.short ? `-${opt.short}, --${longName}` : `--${longName}`;
    if (opt.type === 'string') {
        const meta = getOptionVariableName(longName);
        spec += ` ${meta}`;
        if (opt.multiple) {
            spec += '...';
        }
    }
    return spec;
}

function buildCommandOptionDescription(opt: Option): string {
    let text = opt.help?.trim() || '';
    if (opt.allowedValues?.length) {
        const allowed = opt.allowedValues.join(', ');
        text = text ? `${text} Values: ${allowed}.` : `Values: ${allowed}.`;
    }
    if (opt.multiple) {
        text = text ? `${text} May be repeated.` : 'May be repeated.';
    }
    if (opt.default !== undefined && opt.default !== '' && !Array.isArray(opt.default)) {
        text = text ? `${text} (default: ${opt.default})` : `(default: ${opt.default})`;
    }
    return text;
}

function visibleOptions(command: Command): [string, Option][] {
    return Object.entries(command.options || {}).filter(([name]) => !HIDDEN_OPTIONS.has(name)) as [
        string,
        Option,
    ][];
}

/** Last segment of the long option name (e.g. conflict-strategy → STRATEGY). */
function getOptionVariableName(longName: string): string {
    const segments = longName.split('-').filter(Boolean);
    const base = segments.length ? segments[segments.length - 1]! : longName;
    return base.toUpperCase();
}

function wrapText(text: string, width: number): string[] {
    if (!text) {
        return [''];
    }
    const words = text.trim().split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length <= width) {
            line = next;
        } else {
            if (line) {
                lines.push(line);
            }
            line = word;
        }
    }
    if (line) {
        lines.push(line);
    }
    return lines.length ? lines : [''];
}
