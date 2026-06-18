import { createHash } from 'node:crypto';

export class MessageEmitter {
    private readonly seenMessageKeys = new Set<string>();

    emitOnce(message: string, emit: (message: string) => void): void {
        const key = messageKey(message);
        if (this.seenMessageKeys.has(key)) {
            return;
        }
        this.seenMessageKeys.add(key);
        emit(message);
    }
}

function messageKey(message: string): string {
    return createHash('sha256').update(message).digest('hex');
}
