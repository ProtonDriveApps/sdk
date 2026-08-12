import { Logger, ValidationError } from '@protontech/drive-sdk';

import { sanitizeTerminalText } from '../../cli/formatters';
import { question } from '../../cli/readline';

export enum ConflictChoice {
    Merge = 'merge', // Only for folders
    CreateNewRevision = 'create-new-revision', // Only for files
    Rename = 'rename',
    TrashRemote = 'replace', // Only for upload
    DeleteLocal = 'remove', // Only for download
    Skip = 'skip',
}

const CONFLICT_CHOICES_HELP = {
    [ConflictChoice.Merge]: 'Merge folder contents.',
    [ConflictChoice.CreateNewRevision]: 'Create a new revision of the existing file.',
    [ConflictChoice.Rename]: 'Add a unique suffix to the name.',
    [ConflictChoice.TrashRemote]: 'Trash the remote file or folder and upload the local copy.',
    [ConflictChoice.DeleteLocal]: 'Delete the local file or folder and download the remote copy.',
    [ConflictChoice.Skip]: 'Skip the conflicting file or folder.',
};

export enum ConflictTargetKind {
    File = 'file',
    Folder = 'folder',
}

export class TransferConflictResolver {
    private readonly fileStrategyChoices: readonly ConflictChoice[];
    private readonly folderStrategyChoices: readonly ConflictChoice[];
    private globalFileStrategy?: ConflictChoice;
    private globalFolderStrategy?: ConflictChoice;
    private disableInteractiveResolution: boolean;

    private readonly queuedRequests: {
        name: string;
        kind: ConflictTargetKind;
        resolve: (choice: ConflictChoice) => void;
        reject: (error: unknown) => void;
    }[] = [];
    private strategyResolutionInProgress = false;

    constructor(
        private readonly logger: Logger,
        readonly options: {
            fileStrategyChoices: readonly ConflictChoice[];
            folderStrategyChoices: readonly ConflictChoice[];
            forcedFileStrategy?: string;
            forcedFolderStrategy?: string;
            disableInteractiveResolution?: boolean;
            onInteractivePromptBegin?: () => void;
            onInteractivePromptEnd?: () => void;
        },
    ) {
        this.fileStrategyChoices = options.fileStrategyChoices;
        this.folderStrategyChoices = options.folderStrategyChoices;
        this.globalFileStrategy = options.forcedFileStrategy?.trim()
            ? resolveConflictStrategy(options.forcedFileStrategy, this.fileStrategyChoices)
            : undefined;
        this.globalFolderStrategy = options.forcedFolderStrategy?.trim()
            ? resolveConflictStrategy(options.forcedFolderStrategy, this.folderStrategyChoices)
            : undefined;
        this.disableInteractiveResolution = options.disableInteractiveResolution || false;
    }

    async resolve(name: string, kind: ConflictTargetKind): Promise<ConflictChoice> {
        const global = kind === ConflictTargetKind.File ? this.globalFileStrategy : this.globalFolderStrategy;
        if (global !== undefined) {
            return global;
        }
        if (this.disableInteractiveResolution) {
            throw new ValidationError(`Name conflict on "${name}" (${kind}) already exists`);
        }
        return new Promise<ConflictChoice>((resolve, reject) => {
            this.queuedRequests.push({ name, kind, resolve, reject });
            void this.drainQueue();
        });
    }

    private async drainQueue(): Promise<void> {
        if (this.strategyResolutionInProgress) {
            return;
        }
        this.strategyResolutionInProgress = true;

        try {
            while (this.queuedRequests.length > 0) {
                const pending = this.queuedRequests.shift()!;

                const globalStrategy =
                    pending.kind === ConflictTargetKind.File ? this.globalFileStrategy : this.globalFolderStrategy;
                if (globalStrategy) {
                    this.logger.debug(`Resolved conflict with global strategy: ${globalStrategy}`);
                    pending.resolve(globalStrategy);
                    continue;
                }

                try {
                    const choice = await this.prompt(pending.name, pending.kind);
                    this.logger.debug(`Resolved conflict with choice: ${choice}`);
                    pending.resolve(choice);
                } catch (error) {
                    pending.reject(error);
                    throw error;
                }
            }
        } finally {
            this.strategyResolutionInProgress = false;
        }
    }

    private async prompt(name: string, kind: ConflictTargetKind): Promise<ConflictChoice> {
        this.options.onInteractivePromptBegin?.();
        try {
            return await this.promptLoop(name, kind);
        } finally {
            this.options.onInteractivePromptEnd?.();
        }
    }

    // TODO: In some edge cases the prompt will not receive input back.
    // Seems like some bug in Bun. We should investigate and find some
    // workaround. When this happens, user can use apply-all strategy.
    private async promptLoop(name: string, kind: ConflictTargetKind): Promise<ConflictChoice> {
        const choices = kind === ConflictTargetKind.File ? this.fileStrategyChoices : this.folderStrategyChoices;
        const hint = `Type a strategy (${choices.join(', ')}; or abbreviations), or [a]pply-to-all`;
        while (true) {
            const line = await question(`Conflict on "${sanitizeTerminalText(name)}" (${kind}). ${hint}\n> `);
            if (line === null) {
                return ConflictChoice.Skip;
            }
            const trimmed = line.trim().toLowerCase();
            if (trimmed === 'a' || trimmed === 'apply' || trimmed === 'apply-to-all') {
                const applyAllLine = await question(`Default for all ${kind} conflicts:\n> `);
                const strategy = this.parsePromptStrategy(applyAllLine, choices);
                if (!strategy) {
                    continue;
                }
                if (kind === ConflictTargetKind.File) {
                    this.globalFileStrategy = strategy;
                } else {
                    this.globalFolderStrategy = strategy;
                }
                return strategy;
            }
            const strategy = this.parsePromptStrategy(line, choices);
            if (strategy) {
                return strategy;
            }
        }
    }

    private parsePromptStrategy(line: string | null, choices: readonly ConflictChoice[]): ConflictChoice | undefined {
        if (line === null) {
            return ConflictChoice.Skip;
        }
        try {
            const result = resolveConflictStrategy(line, choices);
            if (!result) {
                console.log('Enter a strategy name or abbreviation.');
                return;
            }
            return result;
        } catch (error) {
            if (error instanceof ValidationError) {
                console.log(error.message);
                return;
            }
            throw error;
        }
    }
}

export function resolveConflictStrategy(
    raw: string,
    choices: readonly ConflictChoice[],
): ConflictChoice | undefined {
    const input = raw.trim().toLowerCase().replace(/_/g, '-');
    if (input === '') {
        return undefined;
    }
    const matches = choices.filter((c) => c.startsWith(input));
    if (matches.length === 0) {
        throw new ValidationError(
            `Invalid conflict strategy "${raw.trim()}". Expected one of: ${choices.join(', ')} (unique abbreviations are allowed).`,
        );
    }
    if (matches.length > 1) {
        throw new ValidationError(
            `Ambiguous conflict strategy "${raw.trim()}". Matches more than one strategy: ${matches.join(', ')}. Use a longer prefix.`,
        );
    }
    return matches[0];
}

export function getConflictChoicesHelp(choices: readonly ConflictChoice[]): { value: ConflictChoice; help: string }[] {
    return choices.map((c) => ({ value: c, help: CONFLICT_CHOICES_HELP[c] }));
}
