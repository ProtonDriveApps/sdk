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

## License

This project is licensed under the MIT License. See [LICENSE.md](./LICENSE.md) for details.

Copyright (c) 2026 Proton AG
