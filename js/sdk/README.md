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
