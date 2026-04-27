# Changelog

## cs/v0.13.8 (2026-04-27)

* Fix nullable data in name conflict error
* Add extension to aborted exception
* Reduce log in controllers
* Improve exception type names in error reports

## cs/v0.13.7 (2026-04-23)

* Remove unnecessary too many children exception
* Log error when volume type is unknown

## cs/v0.13.6 (2026-04-22)

* Handle too many children exception when creating a new draft

## cs/v0.13.5 (2026-04-22)

* Add thumbnail error handling from API response
* Ensure expected SHA1 provider is called only once during upload

## cs/v0.13.4 (2026-04-20)

* Improve download initialization speed by parallelizing some server round-trips
* Add get node for Kotlin drive client
* Fix memory leak on SHA1 provision through interop

## cs/v0.13.3 (2026-04-16)

* Fix failure to upload new revision on single file sharing

## cs/v0.13.2 (2026-04-07)

* Resume continuation only when active
* Log network error and retries in kotlin

## cs/v0.13.1 (2026-04-03)

* Update logs from kotlin resume api
* Fix feature flag parsing in kotlin

## cs/v0.13.0 (2026-04-02)

* Keep http request body in kotlin memory for retries
* Fix illegal assignments of null values to Protobuf fields for authorship results
* Enable streaming of results when enumerating folder children and Photos timeline
* Fix function to get node from Photos client not using Photos API
* Log network body for tests by chunk
* Extract clients interfaces
* Add trash management to Photos

## cs/v0.12.0 (2026-03-30)

* Remove get thumbnails in favor of enumerate thumbnails
* Introduce uids in the kotlin bindings
* Move native weak reference management to kotlin
* Do not call interop functions if cancelled
* Fix thumbnail enumeration to stay within API limits
* Fix cancellation in download and upload
* Log network calls with body size
* Add streaming thumbnails enumeration to Swift bindings
* Remove the need to dispose of Photos client

## cs/v0.11.2 (2026-03-27)

* Stream trash enumeration instead of loading all items at once
* Fix regression in disposal of file transfer controllers
* Update Swift binding to get trash error

## cs/v0.11.1 (2026-03-25)

* Wrap SDK exception into IO exception for android network library to handle it

## cs/v0.11.0 (2026-03-24)

* Surface non-resumable upload and download as typed exceptions

## cs/v0.10.0 (2026-03-24)

* Enable resuming of uploads from Swift bindings

## cs/v0.9.4 (2026-03-23)

* Fix wrong volume type for photo events
* Expose structured data on upload integrity errors to Swift binding

## cs/v0.9.3 (2026-03-23)

* Mark checksum verified as optional in the api
* Report checksum verification state to interop

## cs/v0.9.2 (2026-03-20)

* Report checksum verification state to back-end and client

## cs/v0.9.1 (2026-03-20)

* Report unmapped HTTP errors as Network errors instead of Unknown
* Allow resuming download to non seekable data stream
* Fix wrong link details endpoint being used for Photos
* Improve error details for node decryption failures

## cs/v0.9.0 (2026-03-20)

* Fail node provision when parent key could not be obtained
* Try all album inclusions to find the entry point key
* Handle missing timestamps in photo upload metadata
* Improve error details for drive errors
* Remove failing test data
* Fix telemetry causing deadlock on uploads and downloads
* Expose structured data on upload integrity errors
* Throw error if node is not found
* Parse enumerate result synchronously
* Clarify exception for missing node when looking up entry point
* Fix setup for timeouts in test
* Log number of ids when enumerate thumbnails

## cs/v0.8.1 (2026-03-16)

* Fix disposal of upload controller and update upload bindings api
* Add streaming thumbnails enumeration for Drive and Photos clients
* Update download event values for tests

## cs/v0.8.0 (2026-03-12)

* Implement upload to Photos
* Set swift error message
* Handle nullable OwnedBy fields when mapping to proto
* Propagate individual thumbnail errors to callers instead of silently skipping them
* Add owned by property

## cs/v0.7.0-alpha.17 (2026-03-10)

* Fix manifest verification errors due to wrong thumbnail order in manifest
* Prevent resumed uploads from being paused by a stale previous attempt
* Use java Instant instead for Long to describe time
* Add interop and Kotlin bindings for trash management
* Add context traversal for photo nodes and set telemetry volume type
* Log failed attempts to report decryption errors to telemetry
* Align telemetry with the web SDK

## cs/v0.7.0-alpha.16 (2026-03-04)

* Ensure cancelled uploads/downloads don't block queue

## cs/v0.7.0-alpha.15 (2026-03-03)

* Fix registry not removing objects when the removeAll call happens from the owner's deinit

## cs/v0.7.0-alpha.14 (2026-03-02)

* Improve the way drafts are considered non-resumable to pass through original exceptions

## cs/v0.7.0-alpha.13 (2026-03-02)

* Add Kotlin bindings for trash nodes
* Test should not failed when SDK is aborted
* Improve error reporting for trash and restore operations
* Fix second-attempt file upload failing due to signature key disposal
* Categorize upload integrity exception properly

## cs/v0.7.0-alpha.12 (2026-02-25)

* Transmit api codes through interop
* Provide clearer context when canceling operations
* Improve error reporting with full exception details
* Clean native memory of weak references after release
* Fix failures due to empty authorship results on degraded nodes
* Clean native memory of global weak references
* Upgrade android core to the last version (36.3.0)
* Fix value type check
* Set caller exception as cause to be reported in Sentry
* Add context to timestamp conversion errors
* Raise the timeout to 5min to upload 100MB file
* Log progress as percentage
* Accept null content key signatures

## cs/v0.7.0-alpha.11 (2026-02-18)

* Fix download of photos and their thumbnails from shared albums
* Capture caller stack trace in ResponseCallback
* Fix tranforming CompletedDownloadManifestVerificationException to...
* Only set AEAD flag on file key creation

## cs/v0.7.0-alpha.10 (2026-02-18)

* Introduce callback handle registry, separate callback lifecycle from object lifecycle

## cs/v0.7.0-alpha.9 (2026-02-17)

* Expose errorToString
* Fix deserialization of DegradedNode
* Add E2E tests for photo thumbnails in albums

## cs/v0.7.0-alpha.8 (2026-02-11)

* Provide expected SHA1 for upload through callback
* Refactor and fix support for Photos nodes

## cs/v0.7.0-alpha.7 (2026-02-11)

* Abort pause state on non-resumable upload errors
* Exclude integrity errors from being resumable during upload

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

* Fix files being truncated when downloading to file path through interop
* Follow up on download pausing to address issues with hanging, seeking with interop and telemetry
* Fix timeout reported as cancellation through interop

## cs/v0.7.0-alpha.3 (2026-01-27)

* Transform progress callback to flow
* Implement pausing and resuming of downloads
* Add photos client kotlin bindings for upload
* Handle and send decryption error telemetry to client
* Enable request body streaming for upload

## cs/v0.7.0-alpha.2 (2026-01-26)

* Fix location of Photos project
* Make cache optional
* Log ignored errors
* Add file upload methods to the Photos client
* Replace stream with buffer for HTTP

## cs/v0.7.0-alpha.1 (2026-01-23)

* Enforce static code analysis warnings as errors on release builds
* Replace stream by channel for thumbnails
* Replace stream with channel
* Add node metadata decryption error metrics
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
* Remove debug log with fatal level

## cs/v0.6.0-test.2 (2025-12-04)

* No changes

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
* Remove debug log with fatal level

## cs/v0.6.0-alpha.3 (2025-12-04)

* Bump crypto lib to handle decrypted AEAD session key exports
* Improve performance of iterating over URLSession.AsyncBytes during download
* Handle degraded node

## cs/v0.6.0-alpha.1 (2025-12-02)

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
* Add more logging to transfer queues
* Use streaming in HTTP client
* Add AEAD support
* Add approximate upload size to upload metric event in kt binding
* Improve mapping of SDK exceptions to Kotlin errors
* Add approximate upload size to upload metric event
* Parse Protobuf request within the same JNI call
* Support client-injected feature flags in Swift
* Remove copyrights and optimize imports
* Add filtering by type to thumbnail enumeration
* Fix missing disposal of file uploader and file downloader through interop
* Add pause and resume API
* Add Kotlin bindings package for Android
* Make feature flag provision asynchronous
* Add feature flag support
* Fix cancellation token source being double-freed in the Swift interop
* Fix wrong additional metadata parameters in upload
* Add possibility to provide additional metadata on file upload
* Add method to download thumbnails
* Pass node name conflict error data through interop
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

* Bump crypto lib to handle decrypted AEAD session key exports
* Improve performance of iterating over URLSession.AsyncBytes during download
* Handle degraded node

## cs/0.6.0-alpha.1 (2025-12-02)

* Bump crypto lib to handle decrypted AEAD session key exports
* Improve performance of iterating over URLSession.AsyncBytes during download
* Handle degraded node
