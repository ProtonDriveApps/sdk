# Changelog

## cs/v0.7.0-alpha.8 (2026-02-11)

* Provide expected SHA1 for upload through callback
* Refactor and fix support for Photos nodes

## cs/v0.7.0-alpha.7 (2026-02-11)

* Abort pause state on non-resumable upload errors

## cs/v0.7.0-alpha.6 (2026-02-10)

* Add SHA1 upload verification

## cs/v0.7.0-alpha.5 (2026-02-05)

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

* Follow up on download pausing to address issues with hanging, seeking with interop and telemetry

## cs/v0.7.0-alpha.3 (2026-01-27)

* Transform progress callback to flow
* Add photos client kotlin bindings for upload
* Enable request body streaming for upload

## cs/v0.7.0-alpha.2 (2026-01-26)

* Make cache optional
* Log ignored errors
* Add file upload methods to the Photos client
* Replace stream with buffer for HTTP

## cs/v0.7.0-alpha.1 (2026-01-23)

* Replace stream by channel for thumbnails
* Replace stream with channel
* Fix native clients getting garbage collected during long request to the sdk
* Add Kotlin tests for pausing and resuming downloads
* Fix error not caught or returned to the sdk when scope was null
* Add getThumbnails to DrivePhotosClient
* Remove copyrights

## cs/v0.6.1-alpha.17 (2026-01-20)

* Fix errors not caught in Kotlin bindings and crashing client

## cs/v0.6.1-alpha.16 (2026-01-19)

* No changes

## cs/v0.6.1-alpha.15 (2026-01-16)

* Adding Photos SDK bindings
* Propagate encryption key via client configuration in swift bindings

## cs/v0.6.1-alpha.14 (2026-01-16)

* Improve on-disk cache handling
* Update driveClientCreate to use ProtonDriveClientOptions and timeouts
* Add ability to override HTTP timeouts

## cs/v0.6.1-alpha.13 (2026-01-15)

* Expose functions to trash node through Swift package
* refactor: consolidate PhotoDownloadOperation into DownloadOperation
* Log paused status for each call
* Expose folder creation in interop and Kotlin bindings
* Update coroutine scope when resume
* Introduce PhotoDownloadOperation
* Add Kotlin bindings for rename
* Ignore cancellation error after cancelling in download test
* Expose folder creation in interop and Swift bindings

## cs/v0.6.1-alpha.12 (2026-01-09)

* Prevent download cancellation from blocking future downloads
* Downloading empty file now report metric
* Add Kotlin bindings for isPaused
* Reduce network log level for tests from debug to verbose

## cs/v0.6.1-alpha.11 (2026-01-08)

* No changes

## cs/v0.6.1-alpha.10 (2026-01-07)

* Implement initial photos client interop
* Interop and bindings for DownloadController.GetIsDownloadCompleteWithVerificationIssue
* Avoid logging storage body for test

## cs/v0.6.1-alpha.9 (2026-01-06)

* Fix progress logs in kotlin

## cs/v0.6.1-alpha.8 (2026-01-04)

* Expose function to rename node through Swift package
* Limit GC pressure by creating less Channel instances
* Add levels to logs

## cs/v0.6.1-alpha.7 (2025-12-22)

* Reapply removed upload controller dispose calls
* Move incomplete draft deletion to upload controller disposal

## cs/v0.6.1-alpha.6 (2025-12-19)

* Pass error when operation is paused to the client. Prevent crashes for calls after operation throws.

## cs/v0.6.1-alpha.5 (2025-12-19)

* Add cancellation message when CS cancels a job
* Fix download failures due to missing keys for manifest check
* Cancel CancellationTokenSource when coroutine scope is cancelled executing blocking function
* Extract Job code from JniDriveClient
* Test upload and download events
* Convert stateless JNI methods to static

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
* Add error handling for writing to output stream
* Remove debug log with fatal level

## cs/v0.6.0-test.2 (2025-12-04)

* No changes

## cs/v0.6.0-alpha.7 (2025-12-10)

* Set error type to the name of the Kotlin exception

## cs/v0.6.0-alpha.6 (2025-12-10)

* Improve error generation and parsing in Swift bindings

## cs/v0.6.0-alpha.5 (2025-12-09)

* Check optional proto fields
* Add error handling for writing to output stream

## cs/v0.6.0-alpha.4 (2025-12-05)

* Remove debug log with fatal level

## cs/v0.6.0-alpha.3 (2025-12-04)

* Improve performance of iterating over URLSession.AsyncBytes during download

## cs/v0.6.0-alpha.1 (2025-12-02)

* Fix Kotlin build failure due to Protobuf changes
* Fix crashes when download is interrupted
* Add Kotlin bindings for feature flags
* Remove unused parameter
* Include the Swift's error message in the SDK interop error
* Add auto-retries into HTTP client bridge for certain HTTP errors: 401, 429, 5xx
* Add HTTP timeouts and ability to cancel requests through interop
* Delay opening upload stream until necessery
* Upgrade version from 0.4.0 to 0.5.0
* Close properly response body when read
* Use streaming in HTTP client
* Add approximate upload size to upload metric event in kt binding
* Improve mapping of SDK exceptions to Kotlin errors
* Parse Protobuf request within the same JNI call
* Support client-injected feature flags in Swift
* Remove copyrights and optimize imports
* Add filtering by type to thumbnail enumeration
* Add pause and resume API
* Add Kotlin bindings package for Android
* Fix cancellation token source being double-freed in the Swift interop
* Add method to download thumbnails
* Pass node name conflict error data through interop
* Expose cancellation support in SDK bindings
* Add CI job to build and deploy Swift package
* Update client creation through interop to be able to set client UID
* Add telemetry for uploads
* Expose function to get available node name through Swift package
* Fix logger
* Feat/parse error swift interop
* Fix progress callback doesn't report issue
* Add Swift SDK package for iOS & macOS

## cs/v0.1.0-alpha.3 (2025-10-14)

* No changes

## cs/0.6.0-alpha.3 (2025-12-04)

* Improve performance of iterating over URLSession.AsyncBytes during download

## cs/0.6.0-alpha.1 (2025-12-02)

* Improve performance of iterating over URLSession.AsyncBytes during download
