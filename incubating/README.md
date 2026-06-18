# Incubating Drive SDK modules

Unsupported Drive SDK modules that extend the core client with higher-level functionality. They are used by Proton first-party clients and may be adopted by other integrators, but are not yet on the supported release cycle.

Each module has its own README with usage details, limitations, and current status.

## What belongs here

The Drive SDK provides a **Client** module for core Drive integration: folder listing, files upload and download, move, rename, trash and other file operations, event based update polling, sharing, and other general Drive capabilities. That interface is the foundation every integrator needs.

Higher-level functionality that builds on the Client—but is not required for basic Drive integration—lives in separate modules starting in this directory. Examples include a sync, search, or other features that Proton clients use to deliver a full Drive experience. Only general Drive capabilities belong in the core SDK itself; optional, composable functionality belongs here until it matures.

Once the module is mature, it is promoted to the root directory and becomes part of the supported SDK.

## Expectations

Incubating does **not** mean unfinished or unsuitable for production. Proton clients ship with these modules. It means the public interface, documentation, and release process are not yet stable:

- The API may change without prior announcement.
- Documentation and tests may be incomplete compared to supported modules.

For overall SDK status and third-party usage guidelines, see the [root README](../README.md).

## Modules

| Module | Package | Languages | Status | Description |
| --- | --- | --- | --- | --- |
| [Client](client/) | `me.proton.drive.sdk` (Kotlin), `ProtonDriveSDK` (Swift) | Kotlin, Swift | Incubating | Drive client bindings over the C# SDK. These bindings do not have the same interface yet and is still evolving. |
