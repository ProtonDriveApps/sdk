import { waitForCondition } from './wait';

describe('waitForCondition', () => {
    it('should resolve immediately if condition is met', async () => {
        const callback = jest.fn().mockReturnValue(true);
        await waitForCondition(callback);
        expect(callback).toHaveBeenCalled();
    });

    it('should resolve after condition is met', async () => {
        const callback = jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
        await waitForCondition(callback);
        expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should reject if signal is aborted', async () => {
        const signal = { aborted: true } as any as AbortSignal;
        const callback = jest.fn().mockReturnValue(false);
        await expect(waitForCondition(callback, signal)).rejects.toThrow('aborted');
    });
});
