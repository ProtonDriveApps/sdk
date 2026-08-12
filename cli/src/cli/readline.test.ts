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
        const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
        const stub = {
            question: questionImpl,
            close: (...args: unknown[]) => {
                closeMock(...args);
                stub.emit('close');
            },
            on: jest.fn((event: string, listener: (...args: unknown[]) => void) => {
                let set = listeners.get(event);
                if (!set) {
                    set = new Set();
                    listeners.set(event, set);
                }
                set.add(listener);
            }),
            once: jest.fn((event: string, listener: (...args: unknown[]) => void) => {
                let set = listeners.get(event);
                if (!set) {
                    set = new Set();
                    listeners.set(event, set);
                }
                set.add(listener);
            }),
            emit: (event: string, ...args: unknown[]) => {
                for (const listener of listeners.get(event) ?? []) {
                    listener(...args);
                }
            },
        };
        return stub as unknown as ReadlinePromisesInterface;
    }

    function questionHangingUntilSignalAborted() {
        return jest.fn((_prompt: string, options?: { signal?: AbortSignal }) => {
            return new Promise<string>((_resolve, reject) => {
                options?.signal?.addEventListener('abort', () => {
                    reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
                });
            });
        });
    }

    async function flushUntil(
        predicate: () => boolean,
        maxTicks = 30,
        tick: 'microtask' | 'setImmediate' = 'microtask',
    ): Promise<void> {
        for (let i = 0; i < maxTicks; i++) {
            if (predicate()) {
                return;
            }
            if (tick === 'setImmediate') {
                await new Promise<void>((resolve) => setImmediate(resolve));
            } else {
                await Promise.resolve();
            }
        }
        throw new Error('async progress did not complete in time');
    }

    async function expectStillPending(pending: Promise<unknown>): Promise<void> {
        let settled = false;
        void pending.then(() => {
            settled = true;
        });
        for (let i = 0; i < 5; i++) {
            await Promise.resolve();
        }
        expect(settled).toBe(false);
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

    it('recreates the readline interface on SIGCONT and still accepts input', async () => {
        let emitSigcont!: () => void;
        let releaseSecond!: (value: string) => void;

        mockedCreateInterface
            .mockImplementationOnce(() => {
                const stub = stubInterface(questionHangingUntilSignalAborted());
                emitSigcont = () => stub.emit('SIGCONT');
                return stub;
            })
            .mockImplementationOnce(() =>
                stubInterface(
                    jest.fn(
                        () =>
                            new Promise<string>((resolve) => {
                                releaseSecond = resolve;
                            }),
                    ),
                ),
            );

        const pending = question('resume>');
        await flushUntil(() => mockedCreateInterface.mock.calls.length > 0);

        emitSigcont();
        await flushUntil(() => mockedCreateInterface.mock.calls.length > 1, 30, 'setImmediate');

        releaseSecond('after-fg');
        await expect(pending).resolves.toBe('after-fg');
        expect(mockedCreateInterface).toHaveBeenCalledTimes(2);
    });

    it('does not treat SIGCONT close as EOF', async () => {
        let emitSigcont!: () => void;
        let emitClose!: () => void;
        let releaseSecond!: (value: string) => void;

        mockedCreateInterface
            .mockImplementationOnce(() => {
                const stub = stubInterface(questionHangingUntilSignalAborted());
                emitSigcont = () => stub.emit('SIGCONT');
                emitClose = () => stub.emit('close');
                return stub;
            })
            .mockImplementationOnce(() =>
                stubInterface(
                    jest.fn(
                        () =>
                            new Promise<string>((resolve) => {
                                releaseSecond = resolve;
                            }),
                    ),
                ),
            );

        const pending = question('resume>');
        await flushUntil(() => mockedCreateInterface.mock.calls.length > 0);

        emitSigcont();
        await flushUntil(() => mockedCreateInterface.mock.calls.length > 1, 30, 'setImmediate');

        emitClose();
        await expectStillPending(pending);

        releaseSecond('after-fg');
        await expect(pending).resolves.toBe('after-fg');
    });

    it('preserves history across SIGCONT resume and syncHistory runs only for the winning generation', async () => {
        let emitSigcont!: () => void;
        let releaseSecond!: (value: string) => void;

        mockedCreateInterface.mockImplementationOnce(() => stubInterface(jest.fn(async () => 'prior-line')));

        await expect(question('repl>', { enableHistory: true })).resolves.toBe('prior-line');

        mockedCreateInterface
            .mockImplementationOnce(() => {
                const stub = stubInterface(questionHangingUntilSignalAborted());
                emitSigcont = () => stub.emit('SIGCONT');
                return stub;
            })
            .mockImplementationOnce(() =>
                stubInterface(
                    jest.fn(
                        () =>
                            new Promise<string>((resolve) => {
                                releaseSecond = resolve;
                            }),
                    ),
                ),
            );

        const pending = question('repl>', { enableHistory: true });
        await flushUntil(() => mockedCreateInterface.mock.calls.length > 1);

        emitSigcont();
        await flushUntil(() => mockedCreateInterface.mock.calls.length > 2, 30, 'setImmediate');

        const recreatedOptions = mockedCreateInterface.mock.calls[2]?.[0] as { history?: string[] };
        expect(recreatedOptions.history).toEqual(['prior-line']);

        await expectStillPending(pending);

        releaseSecond('new-answer');
        await expect(pending).resolves.toBe('new-answer');

        mockedCreateInterface.mockImplementationOnce(() => stubInterface(jest.fn(async () => 'third')));
        await expect(question('repl>', { enableHistory: true })).resolves.toBe('third');

        const nextPromptOptions = mockedCreateInterface.mock.calls[3]?.[0] as { history?: string[] };
        expect(nextPromptOptions.history).toEqual(['new-answer', 'prior-line']);
    });
});
