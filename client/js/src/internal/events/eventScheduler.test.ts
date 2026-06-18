import {
    EventScheduler,
} from './eventScheduler';

jest.useFakeTimers();

describe('EventScheduler', () => {
    const callback = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);
    const ownVolumeId = 'own-volume';
    let scheduler: EventScheduler;

    beforeEach(() => {
        callback.mockReset();
        callback.mockResolvedValue(undefined);
        jest.spyOn(Math, 'random').mockReturnValue(1);
        scheduler = new EventScheduler(callback, ownVolumeId);
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.restoreAllMocks();
    });

    it('polls own volumes at the foreground interval', async () => {
        scheduler.addScope('own-volume');

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenLastCalledWith('own-volume');

        await jest.advanceTimersByTimeAsync(29_000);
        expect(callback).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(2_000);
        expect(callback).toHaveBeenCalledTimes(2);
        expect(callback).toHaveBeenLastCalledWith('own-volume');
    });

    it('polls shared volumes at the background interval by default', async () => {
        scheduler.addScope('shared-volume');

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenLastCalledWith('shared-volume');

        await jest.advanceTimersByTimeAsync(599_000);
        expect(callback).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(2_000);
        expect(callback).toHaveBeenCalledTimes(2);
    });

    it('promotes a shared scope to the foreground interval', async () => {
        scheduler.addScope('shared-volume');

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenLastCalledWith('shared-volume');

        await jest.advanceTimersByTimeAsync(32_000);
        expect(callback).toHaveBeenCalledTimes(1);

        scheduler.setForeground('shared-volume');

        expect(callback).toHaveBeenCalledTimes(2);
        expect(callback).toHaveBeenLastCalledWith('shared-volume');

        await jest.advanceTimersByTimeAsync(32_000);
        expect(callback).toHaveBeenCalledTimes(3);
        expect(callback).toHaveBeenLastCalledWith('shared-volume');
    });

    it('demotes the previous foreground shared scope when another is promoted', async () => {
        scheduler.addScope('shared-a');
        scheduler.addScope('shared-b');

        scheduler.setForeground('shared-a');
        scheduler.setForeground('shared-b');

        callback.mockClear();

        await jest.advanceTimersByTimeAsync(32_000);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).not.toHaveBeenCalledWith('shared-a');
        expect(callback).toHaveBeenCalledWith('shared-b');
    });

    it('ignores setBackground for own volumes', async () => {
        scheduler.addScope('own-volume');
        callback.mockClear();

        scheduler.setBackground('own-volume');
        await jest.advanceTimersByTimeAsync(32_000);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenLastCalledWith('own-volume');
    });

    it('stops polling when a scope is removed', async () => {
        scheduler.addScope('shared-volume');
        await Promise.resolve();
        callback.mockClear();

        scheduler.removeScope('shared-volume');
        await jest.advanceTimersByTimeAsync(1_000_000);

        expect(callback).not.toHaveBeenCalled();
    });

    it('does not register the same scope twice', async () => {
        scheduler.addScope('own-volume');
        scheduler.addScope('own-volume');

        expect(callback).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(32_000);
        expect(callback).toHaveBeenCalledTimes(2);
    });

    it('does not schedule the next poll until the callback is resolved', async () => {
        let resolveCallback!: () => void;
        callback.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolveCallback = resolve;
                }),
        );

        scheduler.addScope('own-volume');

        expect(callback).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);

        await jest.advanceTimersByTimeAsync(1_000_000);
        expect(callback).toHaveBeenCalledTimes(1);

        resolveCallback();
        await Promise.resolve();

        expect(jest.getTimerCount()).toBe(1);

        await jest.advanceTimersByTimeAsync(32_000);
        expect(callback).toHaveBeenCalledTimes(2);
    });
});
