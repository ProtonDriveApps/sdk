import { ProtonDriveError } from '@protontech/drive-sdk';

import { AccountApiError } from '../api/accountApi';
import { ReplUnclosedQuoteError } from './splitQuotedLine';

export class ExitError extends Error {}

export class CommandError extends Error {}

export class CommandNotFoundError extends CommandError {}

export class InvalidCommandArgumentsError extends CommandError {}

export class AuthRequiredError extends CommandError {
    constructor() {
        super('You need to login first');
    }
}

export function isRecoverableReplError(error: unknown): boolean {
    if (
        error instanceof ProtonDriveError ||
        error instanceof CommandError ||
        error instanceof AccountApiError ||
        error instanceof ReplUnclosedQuoteError
    ) {
        return true;
    }
    if (error instanceof TypeError) {
        const code = (error as NodeJS.ErrnoException).code;
        return typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS_');
    }
    return false;
}
