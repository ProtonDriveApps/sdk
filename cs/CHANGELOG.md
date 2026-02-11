# Changelog

## cs/v0.7.0-alpha.7 (2026-02-11)

* Abort pause state on non-resumable upload errors
* Exclude integrity errors from being resumable during upload
* Update changelog for cs/v0.7.0-alpha.6

## cs/v0.7.0-alpha.6 (2026-02-10)

* Add SHA1 upload verification
* Update changelog for cs/v0.7.0-alpha.5

## cs/v0.7.0-alpha.5 (2026-02-05)

* Verify C# build for published source code
* Log "is paused" state for download too
* Check is controller is paused instead of looking at the domain error
* Make author and signature verification error mutually exclusive in interop
* Remove Photo from telemetry VolumeType
* Add seek to photo download
* Use SDK to get nodes in tests
* Expose functions to get nodes and enumerate folder children through interop layer
* Add photo upload and xAttr support to Swift bindings
* Use unconfined dispatcher
* Set coroutine context of operation and function to Dispatchers.IO
* Rename Jni* methods to match proto requests

## cs/v0.7.0-alpha.4 (2026-01-30)

* Fix files being truncated when downloading to file path through interop
* Follow up on download pausing to address issues with hanging, seeking with interop and telemetry
* Automate open-sourcing
* Fix timeout reported as cancellation through interop

## cs/v0.7.0-alpha.3 (2026-01-27)

* Transform progress callback to flow
* Implement pausing and resuming of downloads
* Fix Swift package signing
* Add photos client kotlin bindings for upload
* Handle and send decryption error telemetry to client
* Enable request body streaming for upload

## cs/v0.7.0-alpha.2 (2026-01-26)

* Fix location of Photos project
* Make cache optional
* Set version of SDK in swift builds
* Log ignored errors
* Add file upload methods to the Photos client
* Replace stream with buffer for HTTP

## cs/v0.7.0-alpha.1 (2026-01-23)

* Enforce static code analysis warnings as errors on release builds
* Replace stream by channel for thumbnails
* Replace stream with channel
* Add node metadata decryption error metrics
* Get Swift signing certificate from CI variables
* Fix native clients getting garbage collected during long request to the sdk
* Add Kotlin tests for pausing and resuming downloads
* Fix error not caught or returned to the sdk when scope was null
* Add getThumbnails to DrivePhotosClient
* Remove copyrights

## cs/v0.6.1-alpha.17 (2026-01-20)

* Fix errors not caught in Kotlin bindings and crashing client
* Remove unnecessary parameter from .BeginTransaction calls

## cs/v0.6.1-alpha.16 (2026-01-19)

* Improve cache DB transaction locking behavior
* Implement delayed cancellation for reading content during upload

## cs/v0.6.1-alpha.15 (2026-01-16)

* Adding Photos SDK bindings
* Propagate encryption key via client configuration in swift bindings

## cs/v0.6.1-alpha.14 (2026-01-16)

* Improve on-disk cache handling
* Update driveClientCreate to use ProtonDriveClientOptions and timeouts
* Fix download photos from album
* Add ability to override HTTP timeouts

## cs/v0.6.1-alpha.13 (2026-01-15)

* Fix build error due to missing brace in Protobuf definition
* Implement support for protecting SDK databases
* Expose functions to trash node through Swift package
* refactor: consolidate PhotoDownloadOperation into DownloadOperation
* Fix failure to resume upload that has gaps in block upload completions
* Implement 429 handling for block downloads
* Log paused status for each call
* Expose folder creation in interop and Kotlin bindings
* Update coroutine scope when resume
* Introduce PhotoDownloadOperation
* Simplify implementation for pausing uploads
* Add Kotlin bindings for rename
* Ignore cancellation error after cancelling in download test
* Expose folder creation in interop and Swift bindings
* Add support for photo decryption through album key packet

## cs/v0.6.1-alpha.12 (2026-01-09)

* Prevent download cancellation from blocking future downloads
* Downloading empty file now report metric
* Add Kotlin bindings for isPaused
* Reduce network log level for tests from debug to verbose

## cs/v0.6.1-alpha.11 (2026-01-08)

* Fix builds for Kotlin and Swift bindings broken due to Experimental attribute
* Handle 429 responses on block uploads

## cs/v0.6.1-alpha.10 (2026-01-07)

* Fix InteropStream length initialization for write streams
* Implement initial photos client interop
* Interop and bindings for DownloadController.GetIsDownloadCompleteWithVerificationIssue
* Avoid logging storage body for test
* Map download integrity exception to integrity domain for interop

## cs/v0.6.1-alpha.9 (2026-01-06)

* Pause upload on timeout
* Fix progress logs in kotlin

## cs/v0.6.1-alpha.8 (2026-01-04)

* Switch to SQLite-free implementation for in-memory caching
* Expose function to rename node through Swift package
* Update download error handling
* Limit GC pressure by creating less Channel instances
* Add levels to logs

## cs/v0.6.1-alpha.7 (2025-12-22)

* Update swift dependencies
* Reapply removed upload controller dispose calls
* Move incomplete draft deletion to upload controller disposal
* Fix shares and share secrets not being cached
* Expose download integrity errors and download status

## cs/v0.6.1-alpha.6 (2025-12-19)

* Fix download retrying on cancellation
* Pass error when operation is paused to the client. Prevent crashes for calls after operation throws.

## cs/v0.6.1-alpha.5 (2025-12-19)

* Add cancellation message when CS cancels a job
* Fix download failures due to missing keys for manifest check
* Cancel CancellationTokenSource when coroutine scope is cancelled executing blocking function
* Add photos thumbnail downloader
* Update telemetry error mapping
* Implement pausing and resuming of uploads
* Fix exception on retrying thumbnail block upload
* Add photo downloader
* Add Photos client and Photos volume creation
* Extract Job code from JniDriveClient
* Test upload and download events
* Convert stateless JNI methods to static
* Log swallowed exceptions
* Propagate exception to interop logger

## cs/v0.6.1-alpha.4 (2025-12-15)

* No changes

## cs/v0.6.1-alpha.3 (2025-12-15)

* Prefix the SDK static lib name for Swift with `lib`. Use non-macOS runner for SPM release.
* Adds the pause, resume and isPaused calls to Swift bindings for upload and download

## cs/v0.6.1-alpha.2 (2025-12-11)

* No changes

## cs/v0.6.1-alpha.1 (2025-12-11)

* Fix build of Swift bindings on CI
* Attach current thread only when detached
* Reduce log level and normalize logs
* Keep reference to logger provider in Kotlin test
* Set error type to the name of the Kotlin exception
* Improve error generation and parsing in Swift bindings
* Check optional proto fields
* Add properties to query paused state of upload and download
* Prevent download from seeking back in output stream
* Add error handling for writing to output stream
* Add support to C# CLI for downloading by node UID
* Increase number of attempts for block transfers
* Revamp CI pipelines
* Remove debug log with fatal level

## cs/v0.6.0-test.2 (2025-12-04)

* Revamp CI pipelines

## cs/v0.6.0-alpha.7 (2025-12-10)

* Set error type to the name of the Kotlin exception

## cs/v0.6.0-alpha.6 (2025-12-10)

* Improve error generation and parsing in Swift bindings

## cs/v0.6.0-alpha.5 (2025-12-09)

* Check optional proto fields
* Add properties to query paused state of upload and download
* Prevent download from seeking back in output stream
* Add error handling for writing to output stream
* Add support to C# CLI for downloading by node UID

## cs/v0.6.0-alpha.4 (2025-12-05)

* Increase number of attempts for block transfers
* Revamp CI pipelines
* Remove debug log with fatal level
* Fix SPM deployment script
* Fix CLI lacking parallelism when downloading multiple files

## cs/v0.6.0-alpha.3 (2025-12-04)

* Upgrade version from 0.6.0-alpha.1 to 0.6.0-alpha.3
* Bump crypto lib to handle decrypted AEAD session key exports
* Include source commit SHA in release's commit message
* Fix missing artifact requirements for publishing Kotlin package
* Improve performance of iterating over URLSession.AsyncBytes during download
* Handle degraded node

## cs/v0.6.0-alpha.1 (2025-12-02)

* Bump Kotlin package version
* Fix Kotlin build failure due to Protobuf changes
* Implement telemetry for download
* Fix crashes when download is interrupted
* Add Kotlin bindings for feature flags
* Remove unused parameter
* Fix CLI resilience retrying even on successful round trips
* Fix address verification happening too early
* Include the Swift's error message in the SDK interop error
* Add auto-retries into HTTP client bridge for certain HTTP errors: 401, 429, 5xx
* Add HTTP timeouts and ability to cancel requests through interop
* Handle diverging size on upload
* Address security review of C# crypto
* Preserve interop errors passing through SDK
* Allow multiple calls to override native library name
* Replace option to disable HTTP retries with a request type
* Delay opening upload stream until necessery
* Upgrade version from 0.4.0 to 0.5.0
* Add hint to disable retries on HTTP requests
* Close properly response body when read
* Add proguard rules to keep protobuf classes to be optimized
* Fix the crypto library name
* Add more logging to transfer queues
* Use streaming in HTTP client
* Add AEAD support
* Add approximate upload size to upload metric event in kt binding
* Improve mapping of SDK exceptions to Kotlin errors
* Add approximate upload size to upload metric event
* Upgrade version from 0.3.1 to 0.4.0
* Align rules of CI build jobs related to C# SDK
* Parse Protobuf request within the same JNI call
* Support client-injected feature flags in Swift
* Remove copyrights and optimize imports
* Add filtering by type to thumbnail enumeration
* Enable building Swift package with support for both Silicon and Intel iOS simulators
* Fix missing disposal of file uploader and file downloader through interop
* Add pause and resume API
* Add Kotlin bindings package for Android
* Make feature flag provision asynchronous
* Add feature flag support
* Fix cancellation token source being double-freed in the Swift interop
* Android/submodule
* Fix wrong additional metadata parameters in upload
* Tweak CI for SPM build
* Add possibility to provide additional metadata on file upload
* Add method to download thumbnails
* Add empty and thumbnail file uploads for cross client
* Pass node name conflict error data through interop
* Add unit test to verify fix for hanging download due to unreleased semaphore
* Fix blocks not being released during download
* Expose cancellation support in SDK bindings
* Add CI job to build and deploy Swift package
* Update client creation through interop to be able to set client UID
* Add telemetry for uploads
* Expose function to get available node name through Swift package
* Fix logger
* Feat/parse error swift interop
* Fix possibility of missing domain and type on interop errors
* Fix missing SDK version header when injecting HTTP client without interop
* Fix progress callback doesn't report issue
* Fix thumbnails causing upload to hang
* Fix deserialization error on getting available names
* Add Swift SDK package for iOS & macOS
* Fix download error due to misuse of new URL block fields
* Fix error on HTTP response with Expires header when using interop
* Fix deserialization error on download
* Apply server time to PGP when injecting the HTTP client through interop
* Improve logging and clean up some code
* Fix SHA1 extended attribute
* Align JSON output of the C# CLI with the JavaScript one
* Add support for 16KB pages and ARMv7 platform on Android
* Fix conflicting draft deletion failure
* Fix old revision UID being returned instead of new one after revision upload
* Fix various interop issues found after enabling HTTP client injection

## cs/v0.1.0-alpha.3 (2025-10-14)

* Fix conflicting draft deletion failure
* Fix old revision UID being returned instead of new one after revision upload
* Fix thumbnail type enum
* Allow logger provider handle for drive client creation
* Add logging for upload and session
* Make some naming clearer
* Make thumbnail type strongly-typed in Protobufs
* Fix exception when returning HTTP response through interop
* Improve error message in case of invalid cast from interop handle

## cs/0.6.0-alpha.3 (2025-12-04)

* Upgrade version from 0.6.0-alpha.1 to 0.6.0-alpha.3
* Bump crypto lib to handle decrypted AEAD session key exports
* Include source commit SHA in release's commit message
* Fix missing artifact requirements for publishing Kotlin package
* Improve performance of iterating over URLSession.AsyncBytes during download
* Handle degraded node

## cs/0.6.0-alpha.1 (2025-12-02)

* Upgrade version from 0.6.0-alpha.1 to 0.6.0-alpha.3
* Bump crypto lib to handle decrypted AEAD session key exports
* Include source commit SHA in release's commit message
* Fix missing artifact requirements for publishing Kotlin package
* Improve performance of iterating over URLSession.AsyncBytes during download
* Handle degraded node
