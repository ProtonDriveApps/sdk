# Proton Drive SDK

The Proton Drive SDK provides a high-level interface for interacting with Proton Drive. It is available in the following languages:

- **TypeScript** — native SDK in [`js/sdk/`](./js/sdk/), available on npm as [`@protontech/drive-sdk`](https://www.npmjs.com/package/@protontech/drive-sdk). See [changelog](./js/CHANGELOG.md) for changes.
- **C#** — native SDK in [`cs/sdk/`](./cs/sdk/). See [changelog](./cs/CHANGELOG.md) for changes.
- **Kotlin** — bindings that wrap the C# SDK in [`kt/`](./kt/). See [changelog](./cs/CHANGELOG.md) for changes to the C# SDK.
- **Swift** - bindings that wrap the C# SDK in [`swift/ProtonDriveSDK/`](./swift/ProtonDriveSDK/), available on github as [`sdk-swift`](https://github.com/ProtonDriveApps/sdk-swift). See [changelog](./cs/CHANGELOG.md) for changes to the C# SDK.

### Who this is for

| Audience | Expectations |
| --- | --- |
| **Proton first-party clients** | Primary focus today: this codebase is built for and validated alongside official Proton Drive apps. |
| **Personal, non-commercial projects** | Allowed under [Guidelines](#usage-guidelines-for-personal-projects) below. Expect interface changes and the upcoming cryptographic migration until general availability. |
| **Commercial or production third-party apps** | The SDK is not yet ready for third-party production use. |

Using the SDK directly is still recommended over raw Drive API calls for any experimentation, so correctness, safety and rate-limit expectations stay aligned with first-party behavior. The SDK handles encryption and metadata processing, protecting uploaded data from corruption due to incorrect encryption or invalid metadata.

## Current Status

The SDK is actively being integrated into official Proton Drive clients. During this phase, the architecture and public interface may still change.

**Upcoming cryptographic model change**:

- **What changes:** Proton Drive will move to a new cryptographic model that improves performance, simplifies the architecture, and strengthens security.
- **When:** Currently targeted for the **end of 2026/early 2027**. This window is an estimate and may shift; final timing and migration steps will be documented in this README and in the changelogs when they are finalized.
- **What breaks:** Once the service uses the new model, any client that only implements the previous cryptography including older SDK releases will **not** interoperate until upgraded to a release that implements the new model.
- **How to stay informed:** Watch this repository and read changelogs and README for migration notes and definitive dates.

Once these changes are complete and the integration is stable, the SDK will be officially released for third-party use.

Despite not being officially supported for third-party use at present, Proton strongly recommends integrating through this SDK rather than calling the Drive API directly. It is the same implementation used in Proton's first-party clients and is maintained to the same quality standards, even while the public interface continues to evolve. If you integrate without the SDK, you must still follow those guidelines; non-compliant clients may be rate-limited or blocked to protect Proton Drive and other users.

## Usage Guidelines for Personal Projects

The SDK may be used for personal, non-commercial projects. If you choose to build an application using Proton Drive, you **must** adhere to the requirements below.

### Operational requirements

These rules protect service availability and honest identification of clients. Rate limits are per session and user, thus third-party applications use the **same rate-limiting policy** as Proton first-party Drive clients.

| Requirement | Description |
| --- | --- |
| **Use the SDK** | You are strongly encouraged to interact with Proton Drive through the SDK. If you make direct API calls, your application **must** implement the same correctness and safety guarantees as the SDK. Failing to use appropriate caching, event-based sync, parallelism limits, and exponential backoff may cause your application to be rate-limited to protect service availability. |
| **Use official endpoints** | All HTTP requests must go to the official Proton Drive domain. Do not modify or proxy API endpoints to different domains. |
| **Identify your application** | Set the `x-pm-appversion` HTTP header so it identifies your build honestly. Use the shape described below (for example, `external-drive-myapp@1.2.3-stable`). The value must accurately represent your application. Do not spoof or falsify this header. Third-party clients that seek to masquerade as official Proton first-party clients are forbidden and may stop working at any time. Customer support and development use the reported app version to troubleshoot requests; a **specific version may be blocked** if it is known to ship a serious bug. |
| **Use event-based sync** | Synchronize data using Drive events. Do not poll the API or perform frequent recursive traversals of the file tree. Excessive polling or recursion may cause your application and your account to be rate-limited to protect service availability. |

Use this pattern for `x-pm-appversion`:

`external-drive-{name}@{semver}-{channel}+{suffix}` with optional SemVer build metadata `+{suffix}` (for example a short commit hash).

- **`{name}`** — your project identifier using lowercase letters and underscores (e.g. `my_app`).
- **`{semver}`** — `major.minor.patch` (e.g. `1.2.3`).
- (optional) **`{channel}`** — one of `stable`, `beta`, or `alpha`.
- (optional) **`+{suffix}`** — build metadata, for example a short commit hash (e.g. `+abc123f`).

Examples:

- `external-drive-myapp@1.2.3-stable`
- `external-drive-my_app@2.0.0-beta`
- `external-drive-photo_backup@1.0.0-alpha+abc123f`

### Product and legal requirements

These rules keep third-party apps distinguishable from official Proton products and transparent to users.

| Requirement | Description |
| --- | --- |
| **No Proton branding** | Your application must not use Proton logos, trademarks, or design elements. It must be clearly distinguishable as an unofficial, third-party product. |
| **Credential handling disclosure** | When you prompt a user for account details (including but not limited to username and password) your application must clearly state that it is a third-party application not officially supported by Proton. Suggested text: _This is a third-party application not officially supported by Proton._ |

To protect the availability of Proton Drive and to properly safeguard the Proton customer experience, failure to comply with these requirements may result in your third-party application being limited or blocked from accessing Proton services. If you believe your third-party application has been improperly limited and/or blocked, please contact customer support on [proton.me/support/contact](https://proton.me/support/contact).

## Scope and Limitations

The SDK provides functionality for Proton Drive business logic only. It does **not** include:

- Authentication or login flows
- Session management
- User address provider

**Where to look first:** Official Proton Drive clients wire these pieces into the SDK; treat them as the living reference until this repository publishes standalone sample apps. Standalone integration support will be documented once the SDK reaches general availability.

## Documentation

We are preparing the documentation for the SDK. It will be available in the future.

Until then, you can generate the code reference for the TypeScript SDK using the following command:

```bash
cd js/sdk && OUTPUT_PATH=./doc npm run generate-doc:interface
```

## License

This project is licensed under the MIT License. See [LICENSE.md](./LICENSE.md) for details.

> **Using Proton’s hosted services:** The MIT license governs **use of the source code in this repository** only. Access to **Proton’s hosted services** (including Proton Drive) remains subject to separate terms of service and operational policies. Integration rules and enforcement described in this README apply regardless of the OSS license.

Copyright (c) 2026 Proton AG
