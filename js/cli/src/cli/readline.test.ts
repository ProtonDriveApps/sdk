jest.mock('node:readline/promises', () => {
    const actual = jest.requireActual<typeof import('node:readline/promises')>('node:readline/promises');
    return {
        ...actual,
        createInterface: jest.fn(actual.createInterface),
    };
});

import type { Interface as ReadlinePromisesInterface } from 'node:readline/promises';
import * as readline from 'node:readline/promises';

import { question, resetForTests } from './readline';

const mockedCreateInterface = readline.createInterface as jest.MockedFunction<typeof readline.createInterface>;

describe('readline.question', () => {
    beforeEach(() => {
        resetForTests();
        mockedCreateInterface.mockReset();
        const actual = jest.requireActual<typeof import('node:readline/promises')>('node:readline/promises');
        mockedCreateInterface.mockImplementation(actual.createInterface);
    });

    function stubInterface(questionImpl: ReadlinePromisesInterface['question'], closeMock = jest.fn()) {
        const listeners = new Map<string, Set<() => void>>();
        return {
            question: questionImpl,
            close: closeMock,
            once: jest.fn((event: string, listener: () => void) => {
                let set = listeners.get(event);
                if (!set) {
                    set = new Set();
                    listeners.set(event, set);
                }
                set.add(listener);
            }),
            emit: (event: string) => {
                for (const listener of listeners.get(event) ?? []) {
                    listener();
                }
            },
        } as unknown as ReadlinePromisesInterface;
    }

    async function flushUntil(predicate: () => boolean, maxTicks = 30): Promise<void> {
        for (let i = 0; i < maxTicks; i++) {
            if (predicate()) {
                return;
            }
            await Promise.resolve();
        }
        throw new Error('async progress did not complete in time');
    }

    it('serializes overlapping calls — second prompt runs after the first completes', async () => {
        const events: string[] = [];
        let releaseFirst!: () => void;
        const firstFinished = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });

        mockedCreateInterface
            .mockImplementationOnce(() =>
                stubInterface(
                    jest.fn(async (prompt: string) => {
                        events.push(`start:${prompt}`);
                        await firstFinished;
                        events.push(`end:${prompt}`);
                        return 'first-answer';
                    }),
                ),
            )
            .mockImplementationOnce(() =>
                stubInterface(
                    jest.fn(async (prompt: string) => {
                        events.push(`start:${prompt}`);
                        events.push(`end:${prompt}`);
                        return 'second-answer';
                    }),
                ),
            );

        const p1 = question('first>');
        const p2 = question('second>');

        await flushUntil(() => events.some((e) => e.startsWith('start:first')));
        expect(events).toEqual(['start:first>']);

        releaseFirst();
        const [r1, r2] = await Promise.all([p1, p2]);

        expect(r1).toBe('first-answer');
        expect(r2).toBe('second-answer');
        expect(events).toEqual([
            'start:first>',
            'end:first>',
            'start:second>',
            'end:second>',
        ]);
        expect(mockedCreateInterface).toHaveBeenCalledTimes(2);
    });

    it('propagates rejection but still allows following questions', async () => {
        mockedCreateInterface
            .mockImplementationOnce(() =>
                stubInterface(
                    jest.fn(async () => {
                        throw new Error('boom');
                    }),
                ),
            )
            .mockImplementationOnce(() => stubInterface(jest.fn(async () => 'ok')));

        await expect(question('bad')).rejects.toThrow('boom');
        await expect(question('good')).resolves.toBe('ok');
    });

    it('enableHistory passes prior lines to createInterface and persists non-empty answers', async () => {
        mockedCreateInterface
            .mockImplementationOnce(() => stubInterface(jest.fn(async () => 'first')))
            .mockImplementationOnce(() => stubInterface(jest.fn(async () => 'second')));

        await expect(question('repl>', { enableHistory: true })).resolves.toBe('first');
        await expect(question('repl>', { enableHistory: true })).resolves.toBe('second');

        const secondCallOptions = mockedCreateInterface.mock.calls[1]?.[0] as { history?: string[] };
        expect(secondCallOptions.history).toEqual(['first']);
    });

    it('enableHistory backup path trims persisted history to historySize', async () => {
        for (let i = 0; i < 1002; i++) {
            mockedCreateInterface.mockImplementationOnce(() =>
                stubInterface(jest.fn(async () => `line-${i}`)),
            );
        }

        for (let i = 0; i < 1002; i++) {
            await expect(question('repl>', { enableHistory: true })).resolves.toBe(`line-${i}`);
        }

        const nextPromptOptions = mockedCreateInterface.mock.calls[1001]?.[0] as { history?: string[] };
        expect(nextPromptOptions.history).toHaveLength(1000);
        expect(nextPromptOptions.history?.[0]).toBe('line-1000');
        expect(nextPromptOptions.history?.at(-1)).toBe('line-1');
    });

    it('returns null when stdin reaches EOF before an answer', async () => {
        let emitClose!: () => void;
        mockedCreateInterface.mockImplementationOnce(() => {
            const stub = stubInterface(
                jest.fn(() => new Promise<string>(() => {})),
                jest.fn(),
            );
            emitClose = () => stub.emit('close');
            return stub;
        });

        const pending = question('eof>');
        await flushUntil(() => mockedCreateInterface.mock.calls.length > 0);
        emitClose();
        await expect(pending).resolves.toBeNull();
    });
});
