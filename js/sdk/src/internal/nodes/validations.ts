import { c, msgid } from 'ttag';

import { ValidationError } from '../errors';

const MAX_NODE_NAME_LENGTH = 255;

/**
 * @throws Error if the name is empty, long, or includes slash in the name.
 */
export function validateNodeName(name: string): void {
    if (!name) {
        throw new ValidationError(c('Validation Error').t`Name must not be empty`);
    }
    if (name.length > MAX_NODE_NAME_LENGTH) {
        throw new ValidationError(
            c('Validation Error').ngettext(
                msgid`Name must be ${MAX_NODE_NAME_LENGTH} character long at most`,
                `Name must be ${MAX_NODE_NAME_LENGTH} characters long at most`,
                MAX_NODE_NAME_LENGTH
            )
        );
    }
    if (name.includes('/')) {
        throw new ValidationError(c('Validation Error').t`Name must not contain the character '/'`);
    }
}
