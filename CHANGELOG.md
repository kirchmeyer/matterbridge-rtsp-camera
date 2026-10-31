# Changelog

All notable changes to this project are documented here.

## [Unreleased]

## [0.3.2] - 2026-10-31

### Added

- `homekitPort` for a camera in HomeKit mode: the TCP port it listens on (1024 to 65535, different for each camera). Left out, the HomeKit library picks a free port at every start, as before; set, the port stays the same across restarts, so a firewall between networks can be told it. The library still opens a loopback-only port for each connection and UDP ports for a stream.

## [0.3.1] - 2026-08-08

### Changed

- Renamed the public package and plugin configuration to `matterbridge-rtsp-camera` to avoid the existing `matterbridge-camera` npm package.
- Extracted all runtime source into a standalone repository layout.
- Preserved the legacy internal HomeKit identity and storage namespace for pairing compatibility.
- Removed Matterbridge from package dependency metadata, as required by the Matterbridge plugin manager; tests install the SDK transiently instead.
- Removed unused standalone-app configuration and replaced the bundled public test stream with a placeholder URL.
- Tightened schema and runtime validation for camera fields and duplicate IDs.

### Added

- Standalone dependency resolution, direct-source go2rtc tests, repository documentation, and CI.
- Exclusive Matter 1.5 or native HomeKit camera publication.
- Read-only direct-source go2rtc integration.
- Persistent HomeKit accessory identities and FFmpeg SRTP streaming.

[Unreleased]: https://github.com/kirchmeyer/matterbridge-rtsp-camera/compare/0.3.1...HEAD
[0.3.1]: https://github.com/kirchmeyer/matterbridge-rtsp-camera/releases/tag/0.3.1