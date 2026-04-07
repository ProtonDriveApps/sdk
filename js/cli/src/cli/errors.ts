export class CommandError extends Error {}

export class CommandNotFoundError extends CommandError {}

export class InvalidCommandArgumentsError extends CommandError {}

export class AuthRequiredError extends CommandError {
    constructor() {
        super('You need to login first');
    }
}
