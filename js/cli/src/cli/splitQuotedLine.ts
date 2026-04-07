export class ReplUnclosedQuoteError extends Error {
    override name = 'ReplUnclosedQuoteError';

    constructor() {
        super('Unclosed quote in command line');
    }
}

/**
 * Split a line into arguments like a POSIX shell: double quotes group text; spaces inside quotes are literal.
 * Inside double quotes, `\"` and `\\` are escapes. Adjacent quoted and unquoted segments form one word (e.g. `ab"c d"` → `abc d`).
 */
export function splitQuotedLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuote = false;
    let i = 0;

    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
        i++;
    }

    while (i < line.length) {
        const c = line[i];
        if (inQuote) {
            if (c === '\\' && i + 1 < line.length && (line[i + 1] === '"' || line[i + 1] === '\\')) {
                current += line[i + 1];
                i += 2;
                continue;
            }
            if (c === '"') {
                inQuote = false;
                i++;
                continue;
            }
            current += c;
            i++;
            continue;
        }
        if (c === '"') {
            inQuote = true;
            i++;
            continue;
        }
        if (c === ' ' || c === '\t') {
            result.push(current);
            current = '';
            i++;
            while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
                i++;
            }
            continue;
        }
        current += c;
        i++;
    }

    if (inQuote) {
        throw new ReplUnclosedQuoteError();
    }
    result.push(current);
    return result;
}
