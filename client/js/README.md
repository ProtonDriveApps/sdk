# Drive SDK for web

Use only what is exported by the library. This is the public supported API of the SDK. Anything else is internal implementation that can change without warning.

Start by creating instance of the `ProtonDriveClient`. That instance has then available many methods to access nodes, devices, upload and download content, or manage sharing.

### Build

`tsc --emitDeclarationOnly` generates the `.d.ts` type declarations, and the `@swc/cli` (`swc`) transpiles `src` to `dist`. SWC reads the target browsers from [`.browserslistrc`](./.browserslistrc) and downlevels syntax accordingly.

### Testing

Tests are run with `node node_modules/jest/bin/jest.js` instead of the usual `jest` binary. This is a workaround: once `@swc/jest` loads the `@swc/core` native addon, Bun's runtime segfaults (SIGILL) on process teardown, failing the job even though all tests passed. Invoking Jest directly through Node sidesteps Bun's runtime entirely.

### Polyfills

The library does not ship or bundle any polyfills. SWC only downlevels syntax to the browsers listed in [`.browserslistrc`](./.browserslistrc); it does not add runtime polyfills for newer built-in APIs. Consumers targeting a browser that's missing a runtime API the SDK relies on must bring their own polyfill for it.

Known runtime APIs the SDK relies on that are missing on some of its own minimum supported browsers. Consumers supporting these browsers must polyfill the corresponding API themselves (e.g. via `core-js`) before loading the SDK:

- `Array.fromAsync`: missing on Safari 14.1, iOS Safari 14.5-14.8, and Chrome < 121. Throws `TypeError` where unsupported.
- `Uint8Array.prototype.toBase64` / `.fromBase64` / `.toHex` / `.fromHex` (and the static `Uint8Array.fromBase64`/`fromHex`): missing on Safari 14.1, iOS Safari 14.5-14.8, Firefox ESR (128), and Chrome < 133. Used throughout the crypto, upload, and download code paths. Throws `TypeError` where unsupported.
- `Error` constructor `cause` option (`new Error(message, { cause })`): missing on Safari 14.1 and iOS Safari 14.5-14.8 (added in Safari 15). Degrades silently rather than throwing: the option is ignored and `error.cause` stays `undefined`.
