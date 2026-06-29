# Proton Drive SDK Client

The Proton Drive SDK provides a high-level interface for interacting with Proton Drive. It is available in the following languages:

- **TypeScript** — native SDK in [`client/js/`](./js/), available on npm as [`@protontech/drive-sdk`](https://www.npmjs.com/package/@protontech/drive-sdk). See [changelog](./js/CHANGELOG.md) for changes.
- **C#** — native SDK in [`client/cs/`](./cs/). See [changelog](./cs/CHANGELOG.md) for changes.
- **Kotlin** — bindings that wrap the C# SDK in [`incubating/client/kt/`](../incubating/client/kt/). See [changelog](./cs/CHANGELOG.md) for changes to the C# SDK.
- **Swift** - bindings that wrap the C# SDK in [`incubating/client/swift/ProtonDriveSDK/`](../incubating/client/swift/ProtonDriveSDK/), available on github as [`sdk-swift`](https://github.com/ProtonDriveApps/sdk-swift). See [changelog](./cs/CHANGELOG.md) for changes to the C# SDK.

Koltin and Swift bindings are still in incubation and are not guaranteed to have stable interface across releases.

## Documentation

We are preparing the documentation for the SDK. It will be available in the future.

Until then, you can generate the code reference for the C# or TypeScript SDKs using the following command:

```bash
cd client/cs && dotnet docfx metadata docfx/docfx.json && dotnet docfx build docfx/docfx.json
cd client/js && npm run generate-docs
```
