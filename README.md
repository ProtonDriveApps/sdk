# Proton Drive SDK

The Proton Drive SDK provides a high-level interface for interacting with Proton Drive. It is available in JavaScript and C#, with bindings for Swift and Kotlin.

## Current Status

> **Note:** The SDK is not yet ready for third-party production use.

The SDK is actively being integrated into official Proton Drive clients. During this phase, the architecture continues to evolve. A forthcoming major update will introduce a new cryptographic model that significantly improves performance, simplifies the architecture, and enhances security. This update will be a **breaking change**—SDK versions prior to the new crypto model will cease to function.

Once these changes are complete and the integration is stable, the SDK will be officially released for third-party use.

## Usage Guidelines for Personal Projects

The SDK may be used for personal, non-commercial projects. If you choose to build an application using Proton Drive, you **must** adhere to the following requirements:

### Technical Requirements

| Requirement                   | Description                                                                                                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Use the SDK**               | Always interact with Proton Drive through the SDK. Direct API calls are not permitted.                                                                                                                                            |
| **Use official endpoints**    | All HTTP requests must be directed to the official Proton Drive domain. Do not modify or proxy API endpoints to different domains.                                                                                                |
| **Identify your application** | Set the `x-pm-appversion` HTTP header using the format `external-drive-{projectname}@{version}` (e.g., `external-drive-myapp@1.2.3`). This header must accurately represent your application. Do not spoof or falsify this value. |
| **Use event-based sync**      | Synchronize data using Drive events. Do not poll the API or perform frequent recursive traversals of the file tree.                                                                                                               |

Note: The full `x-pm-appversion` string must conform to the regex:

```
/^(external-drive)+(-[a-z_]+)+@[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?-((stable|beta|RC|alpha)(([.-]?\d+)*)?)?([.-]?dev)?(\+.*)?$/i
```

### Branding and User Safety Requirements

| Requirement                        | Description                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No Proton branding**             | Your application must not use Proton logos, trademarks, or design elements. It must be clearly distinguishable as an unofficial, third-party product.   |
| **Credential handling disclosure** | Users must be explicitly warned that they are entering credentials into a non-official application. Passwords must never be stored by your application. |

Failure to comply with these requirements may result in access restrictions.

## Scope and Limitations

The SDK provides functionality for Proton Drive business logic only. It does **not** include:

- Authentication or login flows
- Session management
- User address provider

These dependencies must be supplied by the integrating application. Reference implementations are available in the official Proton Drive clients. Standalone integration support will be provided once the SDK reaches general availability.

## Documentation

We are preparing the documentation for the SDK. It will be available in the future.

## Upload Parallelism Tuning

The SDK supports upload parallelism tuning to improve throughput in CPU- and network-rich environments.

### JavaScript

```ts
import { MemoryCache, OpenPGPCryptoWithCryptoProxy, ProtonDriveClient } from 'proton-drive-sdk';

const client = new ProtonDriveClient({
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

### C#

```csharp
var options = new ProtonDriveClientOptions(
	BindingsLanguage: "csharp",
	Uid: "my-client-uid",
	OverrideDefaultApiTimeoutSeconds: null,
	OverrideStorageApiTimeoutSeconds: null,
	BlockTransferDegreeOfParallelism: 6);

var client = new ProtonDriveClient(
	httpClientFactory,
	accountClient,
	entityCacheRepository,
	secretCacheRepository,
	featureFlagProvider,
	telemetry,
	options);

// Session-based constructor variant:
var sessionClient = new ProtonDriveClient(session, uid: "my-client-uid", blockTransferDegreeOfParallelism: 6);
```

### Swift

```swift
let configuration = ProtonDriveClientConfiguration(
	baseURL: "https://drive-api.proton.me",
	clientUID: "my-client-uid",
	uploadBlockTransferDegreeOfParallelism: 6
)

let client = try await ProtonDriveClient(configuration: configuration, sdkClientProvider: provider)
```

### Kotlin

```kotlin
val request = ClientCreateRequest(
	baseUrl = "https://drive-api.proton.me/",
	loggerProvider = loggerProvider,
	uid = "my-client-uid",
	blockTransferDegreeOfParallelism = 6,
)

val client = ProtonDriveSdk.protonDriveClientCreate(
	coroutineScope = scope,
	userId = userId,
	apiProvider = apiProvider,
	request = request,
	userAddressResolver = userAddressResolver,
	publicAddressResolver = publicAddressResolver,
)

// Session-based variant:
val sessionClient = session.protonDriveClientCreate(
	uid = "my-client-uid",
	blockTransferDegreeOfParallelism = 6,
)
```

Notes:

- Tune gradually and benchmark on representative networks/devices.
- Extremely high values can increase memory usage and trigger server-side throttling.
- C# `BlockTransferDegreeOfParallelism` is clamped to SDK-supported limits.

## License

This project is licensed under the MIT License. See [LICENSE.md](./LICENSE.md) for details.

Copyright (c) 2026 Proton AG
