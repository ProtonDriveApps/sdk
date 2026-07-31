# Changelog

## cli/v0.7.0 (2026-07-30)

### Features
- Add photo download command
- Expose active revision directly instead of wrapping it in result object
- Rename public link to URL access
- Automatically skip nodes with identical content
- Allow sqlite parallel reads
- Add optional module for generating and parsing additional node metadata
- Add albums commands
- Upload photos to timeline
- Log CLI & SDK version when starting


## cli/v0.6.0 (2026-07-17)

### Features
- Support pass as credentials store
- Allow upload with no expectedSize


## cli/v0.5.0 (2026-07-13)

### Features
- Allow leaving shared node by path
- Add log rotation
- Support leaving a node shared with you
- Detect media type with upper cased file extension
- Support reporting abuse for invitations
- Respect telemetry preference
- Support single quotes in interactive shell
- Allow move and trash for shared with me nodes
- Get account url based on base url
- Support report abuse for direct and public shares

### Bug Fixes
- Use the single crypto proxy instance

### Other
- Reuse already decoded image for thumbnail generation
- Avoid progress callback including big closure


## cli/v0.4.6 (2026-06-17)

* Fix persisting content key packet in crypto cache

## cli/v0.4.5 (2026-06-15)

* Explicitly skip Proton Docs and Sheets
* Improve common error messages with help what to do next
* Fix handling missing public address

## cli/v0.4.4 (2026-06-12)

* Add extra help to each command
* Add transfer summary
* Fix download to existing folder on Windows

## cli/v0.4.3 (2026-06-10)

* Do not log response data

## cli/v0.4.2 (2026-06-09)

* Initial commit
