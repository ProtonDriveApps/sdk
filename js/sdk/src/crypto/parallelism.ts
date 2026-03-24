import { OpenPGPCrypto } from './interface';
import { Logger } from '../interface';

/**
 * Applies optional worker-pool tuning on the injected crypto module when
 * the runtime implementation exposes a supported hook.
 */
export function configureOpenPgpWorkerPool(
    openPGPCryptoModule: OpenPGPCrypto,
    workerPoolSize: number | undefined,
    logger?: Logger,
): void {
    if (workerPoolSize === undefined) {
        return;
    }

    const cryptoModuleWithHooks = openPGPCryptoModule as OpenPGPCrypto & {
        setWorkerPoolSize?: (poolSize: number) => void;
        configureWorkers?: (options: { poolSize: number }) => void;
    };

    if (typeof cryptoModuleWithHooks.setWorkerPoolSize === 'function') {
        cryptoModuleWithHooks.setWorkerPoolSize(workerPoolSize);
        logger?.info(`Configured OpenPGP worker pool size to ${workerPoolSize}`);
        return;
    }

    if (typeof cryptoModuleWithHooks.configureWorkers === 'function') {
        cryptoModuleWithHooks.configureWorkers({ poolSize: workerPoolSize });
        logger?.info(`Configured OpenPGP worker pool size to ${workerPoolSize}`);
        return;
    }

    logger?.warn(
        'upload.cryptoWorkerPoolSize is set, but the provided OpenPGP module does not expose a worker-pool hook',
    );
}
