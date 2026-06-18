import { ValidationError } from '@protontech/drive-sdk';
import { getMockLogger } from '@protontech/drive-sdk/tests/logger';

import { question } from '../../cli/readline';
import {
    ConflictChoice,
    ConflictTargetKind,
    resolveConflictStrategy,
    TransferConflictResolver,
} from './transferConflictResolver';

jest.mock('../../cli/readline', () => ({
    question: jest.fn(),
}));

const mockedQuestion = question as jest.MockedFunction<typeof question>;

function mockReadlineAnswers(...lines: string[]) {
    const queue = [...lines];
    mockedQuestion.mockImplementation(() => Promise.resolve(queue.shift() ?? ''));
    return { question: mockedQuestion };
}

describe('TransferConflictResolver', () => {
    let consoleLogSpy: jest.SpyInstance<void, Parameters<typeof console.log>>;

    beforeEach(() => {
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        mockedQuestion.mockImplementation(() => {
            throw new Error('question: use mockReadlineAnswers() in this test');
        });
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    describe('forced strategies', () => {
        it('returns forced file strategy for file conflicts', async () => {
            const resolver = new TransferConflictResolver(getMockLogger(), { forcedFileStrategy: 'replace' });
            await expect(resolver.resolve('x', ConflictTargetKind.File)).resolves.toBe(ConflictChoice.Replace);
        });

        it('returns forced folder strategy for folder conflicts', async () => {
            const resolver = new TransferConflictResolver(getMockLogger(), { forcedFolderStrategy: 'skip' });
            await expect(resolver.resolve('x', ConflictTargetKind.Folder)).resolves.toBe(ConflictChoice.Skip);
        });
    });

    describe('disableInteractiveResolution', () => {
        it('throws when no global strategy and interactive is disabled', async () => {
            const resolver = new TransferConflictResolver(getMockLogger(), { disableInteractiveResolution: true });
            await expect(resolver.resolve('foo.txt', ConflictTargetKind.File)).rejects.toMatchObject({
                message: expect.stringMatching(/Name conflict on "foo\.txt".*\(file\)/),
            });
        });
    });

    describe('interactive resolution', () => {
        it('resolves one item', async () => {
            mockReadlineAnswers('replace');
            const resolver = new TransferConflictResolver(getMockLogger(), {});
            await expect(resolver.resolve('a', ConflictTargetKind.File)).resolves.toBe(ConflictChoice.Replace);
        });

        it('resolves multiple items sequentially', async () => {
            mockReadlineAnswers('merge', 'skip');
            const resolver = new TransferConflictResolver(getMockLogger(), {});
            const a = resolver.resolve('a', ConflictTargetKind.File);
            const b = resolver.resolve('b', ConflictTargetKind.File);
            await expect(Promise.all([a, b])).resolves.toEqual([ConflictChoice.Merge, ConflictChoice.Skip]);
        });

        it('apply-to-all sets global strategy for subsequent conflicts of the same kind', async () => {
            mockReadlineAnswers('a', 'skip', 'merge');
            const resolver = new TransferConflictResolver(getMockLogger(), {});

            await expect(resolver.resolve('first', ConflictTargetKind.File)).resolves.toBe(ConflictChoice.Skip);
            await expect(resolver.resolve('second', ConflictTargetKind.File)).resolves.toBe(ConflictChoice.Skip);
            await expect(resolver.resolve('third', ConflictTargetKind.Folder)).resolves.toBe(ConflictChoice.Merge);
        });
    });
});

describe('resolveConflictStrategy', () => {
    const allChoices = Object.values(ConflictChoice);

    it('returns undefined for blank input', () => {
        expect(resolveConflictStrategy('   ', allChoices)).toBeUndefined();
    });

    it('normalizes underscores to hyphens', () => {
        expect(resolveConflictStrategy('keep_both', allChoices)).toBe(ConflictChoice.KeepBoth);
    });

    it('resolves a unique prefix', () => {
        expect(resolveConflictStrategy('rep', allChoices)).toBe(ConflictChoice.Replace);
    });

    it('throws when no strategy matches', () => {
        expect(() => resolveConflictStrategy('nope', allChoices)).toThrow(ValidationError);
    });

    it('throws when the prefix matches more than one choice', () => {
        expect(() =>
            resolveConflictStrategy('m', [ConflictChoice.Merge, 'mess' as ConflictChoice]),
        ).toThrow(ValidationError);
    });
});
