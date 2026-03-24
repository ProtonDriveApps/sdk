# Drive SDK for web

Use only what is exported by the library. This is the public supported API of the SDK. Anything else is internal implementation that can change without warning.

Start by creating instance of the `ProtonDriveClient`. That instance has then available many methods to access nodes, devices, upload and download content, or manage sharing.

```js
import { ProtonDriveClient, MemoryCache, OpenPGPCryptoWithCryptoProxy } from 'proton-drive-sdk';

const sdk = new ProtonDriveClient({
    httpClient,
    entitiesCache: new MemoryCache(),
    cryptoCache: new MemoryCache(),
    account,
    openPGPCryptoModule: new OpenPGPCryptoWithCryptoProxy(cryptoProxy),
});
```

## Upload Performance Tuning

You can tune upload concurrency and hashing behavior through `config.upload`:

```js
const sdk = new ProtonDriveClient({
    httpClient,
    entitiesCache: new MemoryCache(),
    cryptoCache: new MemoryCache(),
    account,
    openPGPCryptoModule: new OpenPGPCryptoWithCryptoProxy(cryptoProxy),
    config: {
        upload: {
            encryptionConcurrency: 4,
            maxUploadingBlocks: 8,
            maxBufferedBlocks: 24,
            maxConcurrentFileUploads: 8,
            maxConcurrentUploadSizeInBlocks: 16,
            useWorkerHashing: true,
            cryptoWorkerPoolSize: 4,
        },
    },
});
```

Tips:

- Increase values gradually and benchmark on your target hardware/network.
- Higher values increase memory usage.
- If your OpenPGP module does not expose worker-pool controls, `cryptoWorkerPoolSize` is ignored.
