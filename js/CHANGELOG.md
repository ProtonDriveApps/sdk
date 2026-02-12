# Changelog

## js/v0.9.9 (2026-02-12)

* Support getAvailableName for public client
* Add iterator of album photos
* Add method to remove photos from an album

## js/v0.9.8 (2026-02-10)

* Add experimental getNodePassphrase
* Add SHA1 upload verification
* Add album management

## js/v0.9.7 (2026-02-05)

* [DRVWEB-5135] Add empty trash for photo volume

## js/v0.9.6 (2026-02-02)

* Add experimental createDocument to create Docs/Sheets
* Add function to create bookmark

## js/v0.9.5 (2026-01-29)

* Remove check of NodeType inside iterateThumbnails
* Fix file with content check for diagnostics

## js/v0.9.4 (2026-01-22)

* Add function to scan for malware
* Release lock after download and close the stream in diagnostics
* Report metrics from photos as own_photo_volume
* Fix default timeout on rate limit

## js/v0.9.3 (2026-01-16)

* Fix invitation node type
* Upgrade CryptoProxy and SRP

## js/v0.9.2 (2026-01-13)

* Fix typing of CryptoProxy and CLI
* Add tree structure to diagnostics
* Multiple public fixes

## js/v0.9.1 (2026-01-07)

* Handle timeouts during uploads
* Fix buffered seekable stream
* Catch TypeError when calling releaseLock

## js/v0.9.0 (2025-12-17)

* Allow download with signature issues
* Add empty-trash Implementation
* Handle failed upload due to double-commit attempt

## js/v0.8.0 (2025-12-15)

* Use remove-mine for deleting nodes on public page
* Fix old content key packet verification
* Compress extended attributes

## js/v0.7.3 (2025-12-12)

* Create findPhotoDuplicates to get uids of duplicates

## js/v0.7.2 (2025-12-11)

* Fix photo node type
* Add getMyPhotosRootFolder

## js/v0.7.1 (2025-12-08)

* Photos entity to support full decryption and access to photo attributes
* Add onMessage to ProtonDrivePublicLinkClient
* Add modification time to the node entity
* Add new name param to copy

## js/v0.7.0 (2025-11-28)

* Add unauth prefix for all API calls from public link context
* Ignore missing signatures on legacy nodes
* Abort uploads properly

## js/v0.6.2 (2025-11-21)

* Fix deleting draft
* CaptureTime unix time was in milliseconds instead of seconds
* Make feature flag provision asynchronous
* Add feature flag support

## js/v0.6.1 (2025-11-20)

* Add isDuplicatePhoto method
* Refresh node when share already exists
* Add diagnostics for Photos timeline
* Rename getOwnVolumeIDs to getRootIDs
* Add rename and delete for public link SDK
* Fix typo in class name
* Add create folder & upload for public link SDK
* Add diagnostic progress
* Ignore TimeoutError and similar from decryption issues

## js/v0.6.0 (2025-10-24)

* Parametrize shared with me and invitations for Photos SDK
* Expose sharing for Photos SDK
* Add getAvailableName method

## js/v0.5.1 (2025-10-22)

* Add expectedStrcuture options for diagnostics
* Convert revisions to public interface
* Update public access to new APIs
* Return new UID of copied node
* Throw NodeWithSameNameExists from createFolder
* Use shares/photos endpoint to bootstrap photos
* Add telemetry for debouncer
* Fix aborting uploads & downloads
* Make deleting share with force explicit

## js/v0.5.0 (2025-10-03)

* Do not send cleartext file size
* Add propagating offline error to SDK events
* fileUpload completion should return nodeUid and nodeRevisionUid
* Batch and split per volume trash/restore/delete nodes
* Abort decrypting nodes
* Handle abort errors
* [JS] Use the same instance of uploadController in stream upload
* Add CLI commands for public access
* Reuse endpoints for public link
* Add debouncer to avoid parallel loading of the same node
* Add functions to upload from and download to a file path

## js/v0.4.1 (2025-09-24)

* Add isSharedPublicly to node based on ShareURLID
* Implement CLI photo download
* Implement photo upload

## js/v0.4.0 (2025-09-22)

* Implement ProtonDrivePhotosClient basics
* Add filter options for listing children
* Add copyNodes
* Handle node out of sync during rename
* Return FastForward event if there is no relevant core event

## js/v0.3.2 (2025-09-17)

* Fix SharedWithMe cache
* Reuse Node entity for public link access
* Add cause to wrapped errors
* Provide file progress in onProgress callback

## js/v0.3.1 (2025-09-11)

* NotFoundAPIError is inherited from ValidationError
* Fix decrpyting bookmark with custom password
* Fix cache shared by me
* Revamp docs guides
* Add public access

## js/v0.3.0 (2025-09-04)

* Fix cache in CLI
* Improve performance of loading shared with me
* Fix what address is used to invite users into the share
* Rename NodeAlreadyExistsValidationError
* Fix accepting entities and UIDs in the interface
* Revamp documentation
* Add node details to diagnostic results

## js/v0.2.1 (2025-08-20)

* Separate custom password from bookmark url
* Fix parsing claimedModificationTime in NodesCache
* Invalid value code is ValidationError

## js/v0.2.0 (2025-08-14)

* Add node membership
* Update telemetry object
* Fix download
* Add download unit tests
* Add seeking support for download

## js/v0.1.2 (2025-08-04)

* Fix event subscriptions
* Fix invalidating cache after upload

## js/v0.1.1 (2025-08-01)

* Improve loading nodes performance
* Remove obsolete signature check on block download
* Return nodes integration test
* Add node.uid to proton invitation + fix invitation accept
* Export event types
* Run pretty on all sdk and cli source code

## js/v0.1.0 (2025-07-29)

* Refactor event manager:
* Add diagnostic tool
* Add support of client UID
* Add integration test for moving node
* Fix move twice
* Add NumAccess to publicLink
* Support multiple volumes thumbnails

## js/v0.0.13 (2025-07-18)

* Add album node type
* Fix test of asyncIteratorMap
* Create draft when starting upload
* Parse claimedModificationTime on cache
* Decrypt nodes in parallel
* Filter out photos and albums from shared with me listing
* Set admin role for all nodes in own volume
* add existingNodeUid on NodeAlreadyExistsValidationError

## js/v0.0.12 (2025-07-10)

* No changes

## js/v0.0.11 (2025-07-10)

* Remove sensitive info from logs
* Implement bookmarks management
* Add deprecated share ID
* Add fallback unknown error message
* Fix returning public revision
* Fix parsing node from cache
* Add integration tests for web SDK using real crypto module
* Use ExpirationTime instead of ExpirationDuration for public link management
* Align error categories for upload/download telemetry with definitions
* Add missing re-export of the interface

## js/v0.0.10 (2025-06-26)

* adding a deprecated shareId prop to the Device object
* add management of public links
* fix stuck loop in download
* fix download copy

## js/v0.0.9 (2025-06-24)

* Add resend invite implementation
* implement getNodeUid
* Update decryption telemetry according to documentation
* L10N-4186 Add test/extract job ttag
* Create type structure for keys

## js/v0.0.8 (2025-06-19)

* use nodeUid for external invite instead of volumeId
* Update type of CryptoProxy
* signMessage accept signatureContext and not context

## js/v0.0.7 (2025-06-18)

* Pass nameSessionKey to moveNode

## js/v0.0.6 (2025-06-17)

* Allow to pass either single or multiple key to match CryptoProxy Api

## js/v0.0.5 (2025-06-11)

* add getNode method
* add block verification telemetry
* configuration for npm package publishing
* add experimental getDocsKey
* reuse array buffer
* fix getting address key
* handle missing public address

## js/v0.0.4 (2025-06-02)

* add getNode method
* add block verification telemetry
* configuration for npm package publishing
* add experimental getDocsKey
* reuse array buffer
* fix getting address key
* handle missing public address
