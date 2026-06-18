import { MessageEmitter } from './messageEmitter';

describe('MessageEmitter', () => {
    it('invokes emit only once for an identical message', () => {
        const deduper = new MessageEmitter();
        const emit = jest.fn();

        deduper.emitOnce('same', emit);
        deduper.emitOnce('same', emit);

        expect(emit).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledWith('same');
    });

    it('invokes emit once per distinct message', () => {
        const deduper = new MessageEmitter();
        const emit = jest.fn();

        deduper.emitOnce('a', emit);
        deduper.emitOnce('b', emit);

        expect(emit).toHaveBeenCalledTimes(2);
        expect(emit).toHaveBeenNthCalledWith(1, 'a');
        expect(emit).toHaveBeenNthCalledWith(2, 'b');
    });

    it('does not dedupe across separate instances', () => {
        const emit = jest.fn();

        new MessageEmitter().emitOnce('x', emit);
        new MessageEmitter().emitOnce('x', emit);

        expect(emit).toHaveBeenCalledTimes(2);
    });
});
