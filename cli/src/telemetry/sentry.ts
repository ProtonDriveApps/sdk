import type { ErrorEvent, StackFrame } from '@sentry/bun';
import * as Sentry from '@sentry/bun';

export type { SeverityLevel } from '@sentry/bun';

let sentryEnabled = false;

const PATH_REDACT = '[PATH]';
const URL_REDACT = '[URL]';

export function initSentry(options: { dsn?: string; appVersion: string; sdkVersion?: string }) {
    const dsn = options.dsn;
    if (!dsn?.trim()) {
        return;
    }

    sentryEnabled = true;

    Sentry.init({
        dsn: dsn.trim(),
        release: `${options.appVersion} (sdk: ${options.sdkVersion ?? 'unknown'})`,
        includeServerName: false,
        sendDefaultPii: false,
        beforeSend(event) {
            return scrubErrorEventForLocalPii(event);
        },
        // Do not send console outputs to Sentry to avoid sending PII.
        integrations: (defaults) => {
            return defaults.filter((integration) => integration.name !== 'Console');
        },
    });
}

function scrubErrorEventForLocalPii(event: ErrorEvent): ErrorEvent {
    if (event.message) {
        event.message = scrubPathsInString(event.message);
    }
    if (event.logentry?.message) {
        event.logentry.message = scrubPathsInString(event.logentry.message);
    }

    const exceptions = event.exception?.values;
    if (exceptions) {
        for (const ex of exceptions) {
            if (ex.value) {
                ex.value = scrubPathsInString(ex.value);
            }
            const frames = ex.stacktrace?.frames;
            if (frames) {
                for (const frame of frames) {
                    scrubStackFrame(frame);
                }
            }
        }
    }

    const threads = event.threads?.values;
    if (threads) {
        for (const thread of threads) {
            const frames = thread.stacktrace?.frames;
            if (frames) {
                for (const frame of frames) {
                    scrubStackFrame(frame);
                }
            }
        }
    }

    return event;
}

function scrubStackFrame(frame: StackFrame): void {
    if (frame.filename) {
        frame.filename = scrubPathsInString(frame.filename);
    }
    if (frame.abs_path) {
        frame.abs_path = scrubPathsInString(frame.abs_path);
    }
    if (frame.context_line) {
        frame.context_line = scrubPathsInString(frame.context_line);
    }
    if (frame.pre_context?.length) {
        frame.pre_context = frame.pre_context.map(scrubPathsInString);
    }
    if (frame.post_context?.length) {
        frame.post_context = frame.post_context.map(scrubPathsInString);
    }
    if (frame.vars && typeof frame.vars === 'object') {
        for (const key of Object.keys(frame.vars)) {
            const v = frame.vars[key];
            if (typeof v === 'string') {
                frame.vars[key] = scrubPathsInString(v);
            }
        }
    }
}

/**
 * Redacts path-like spans (and full http(s)/file URLs) so directory layout and user home are not sent.
 */
function scrubPathsInString(str: string): string {
    const unixPathRe = new RegExp(String.raw`(?<!:)(/(?:[^/\s]+/)*[^/\s]+(?::\d+){0,2})`, 'g');
    return str
        .replace(/\bfile:\/\/\S+/gi, PATH_REDACT)
        .replace(/\bhttps?:\/\/\S+/gi, URL_REDACT)
        .replace(/\\{2}[^\s'")\]]+/g, PATH_REDACT)
        .replace(/\b[a-zA-Z]:\\[^\s'")\]]+/g, PATH_REDACT)
        .replace(unixPathRe, PATH_REDACT);
}

export function captureException(error: unknown) {
    if (!sentryEnabled) {
        return;
    }
    Sentry.captureException(error);
}

export function captureMessage(
    message: string,
    data: {
        level: Sentry.SeverityLevel;
        tags?: { [key: string]: string };
        extra?: { [key: string]: unknown };
    },
) {
    if (!sentryEnabled) {
        return;
    }
    Sentry.captureMessage(message, data);
}

export function addBreadcrumb(data: {
    message: string;
    level: Sentry.SeverityLevel;
    category: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: { [key: string]: any };
}) {
    if (!sentryEnabled) {
        return;
    }
    Sentry.addBreadcrumb(data);
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
    if (!sentryEnabled) {
        return;
    }
    await Sentry.flush(timeoutMs);
}
