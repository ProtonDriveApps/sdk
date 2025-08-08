import * as readline from 'readline';

import { SeekableReadableStream } from '../../../sdk/src';

import { Command, ActionArgs } from './interface';
import { runForever } from './events';

export class CommandFileSystemDownloadSeeking implements Command {
    group = 'filesystem';
    name = 'download-seeking';
    args = ['path'];

    async action({ sdk, paths, args: [pathString] }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        const downloader = await sdk.getFileDownloader(node);

        const claimedSize = downloader.getClaimedSizeInBytes();
        console.log(`Claimed size: ${claimedSize || 'N/A'} bytes`);

        const stream = downloader.getSeekableStream();

        this.startInteractiveShell(stream);

        await runForever();
    }

    private startInteractiveShell(stream: SeekableReadableStream) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: '> ',
        });

        console.log('Interactive download shell started. Type "help" for available commands.');
        rl.prompt();
        rl.on('line', async (input: string) => {
            await this.processCommand(input, stream, () => rl.close());
            rl.prompt();
        });
        rl.on('close', () => {
            process.exit(0);
        });
    }

    private async processCommand(input: string, stream: SeekableReadableStream, onExit: () => void) {
        const trimmed = input.trim();
        if (!trimmed) {
            return;
        }

        const parts = trimmed.split(/\s+/);
        const command = parts[0].toLowerCase();
        const arg = parts[1];

        try {
            switch (command) {
                case 'help':
                    this.printHelp();
                    break;

                case 'read':
                    const bytesToRead = parseInt(arg);
                    if (isNaN(bytesToRead)) {
                        console.log('Error: Please provide a valid number of bytes to read');
                        break;
                    }

                    await this.readBytes(stream, bytesToRead);
                    break;

                case 'seek':
                    const position = parseInt(arg);
                    if (isNaN(position)) {
                        console.log('Error: Please provide a valid byte position to seek to');
                        break;
                    }

                    await stream.seek(position);
                    break;

                case 'exit':
                    onExit();
                    return;

                default:
                    console.log(`Unknown command: ${command}. Type "help" for available commands.`);
                    break;
            }
        } catch (error) {
            console.error(`Error executing command: ${error instanceof Error ? error.message : error}`);
        }
    }

    private printHelp() {
        console.log('Available commands:');
        console.log('  help           - Show this help');
        console.log('  read NUMBER    - Read NUMBER bytes from current position');
        console.log('  seek NUMBER    - Seek to byte position NUMBER');
        console.log('  exit           - Exit the interactive shell');
    }

    private async readBytes(stream: SeekableReadableStream, bytesToRead: number) {
        const { value, done } = await stream.read(bytesToRead);
        console.log(this.formatBytes(value));
        if (done) {
            console.log('End of stream reached');
        }
    }

    private formatBytes(bytes: Uint8Array): string {
        const maxDisplayBytes = 200; // Limit display to avoid overwhelming output
        const displayBytes = bytes.slice(0, maxDisplayBytes);

        let textDisplay = '';
        let isPrintable = true;

        for (let i = 0; i < displayBytes.length; i++) {
            const byte = displayBytes[i];
            if (byte >= 32 && byte <= 126) {
                textDisplay += String.fromCharCode(byte);
            } else if (byte === 10 || byte === 13 || byte === 9) {
                // Allow newlines, carriage returns, and tabs
                textDisplay += String.fromCharCode(byte);
            } else {
                isPrintable = false;
                break;
            }
        }

        let result = '';

        if (isPrintable && textDisplay.length > 0) {
            result += 'Text representation:\n' + textDisplay + '\n\n';
        }

        result += 'Hex representation:\n';
        const hexLines = [];
        for (let i = 0; i < displayBytes.length; i += 16) {
            const line = displayBytes.slice(i, i + 16);
            const hex = Array.from(line, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
            const ascii = Array.from(line, (byte) =>
                byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.',
            ).join('');
            hexLines.push(`${i.toString(16).padStart(8, '0')}: ${hex.padEnd(47)} |${ascii}|`);
        }
        result += hexLines.join('\n');

        if (bytes.length > maxDisplayBytes) {
            result += `\n... (${bytes.length - maxDisplayBytes} more bytes)`;
        }

        return result;
    }
}
