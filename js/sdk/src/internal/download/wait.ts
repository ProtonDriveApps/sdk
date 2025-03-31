import { AbortError } from "../../errors";

const WAIT_TIME = 50;

export function waitForCondition(callback: () => boolean, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const waitForCondition = () => {
            if (signal?.aborted) {
                return reject(new AbortError());
            }
            if (callback()) {
                return resolve();
            }
            setTimeout(waitForCondition, WAIT_TIME);
        };
        waitForCondition();
    });
}
