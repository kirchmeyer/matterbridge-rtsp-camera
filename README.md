# Matterbridge RTSP Camera

[![CI](https://github.com/kirchmeyer/matterbridge-rtsp-camera/actions/workflows/ci.yml/badge.svg)](https://github.com/kirchmeyer/matterbridge-rtsp-camera/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/matterbridge-rtsp-camera)](https://www.npmjs.com/package/matterbridge-rtsp-camera)
[![license](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

A Matterbridge DynamicPlatform plugin that exposes configured RTSP cameras through either Matter 1.5 Camera or native Apple HomeKit. The modes are exclusive, so a camera is never published through both protocols at once.

This is an independent, non-certified open-source project. Matter is a trademark of the [Connectivity Standards Alliance](https://csa-iot.org/). Apple and HomeKit are trademarks of Apple Inc.

## Features

- Matter 1.5 Camera endpoints with JPEG snapshots and WebRTC live view through go2rtc.
- Native HomeKit camera accessories with FFmpeg H.264/SRTP streaming.
- Stable identities derived from user-controlled camera IDs.
- Read-only go2rtc integration: direct RTSP sources are passed to media APIs without adding, replacing, or deleting shared stream definitions.
- One protocol mode per plugin instance to prevent duplicate camera publication.

## Requirements

- Matterbridge 3.10.4 or newer.
- Node.js 22.13 or newer in the supported 22 or 24 release lines.
- H.264 RTSP camera streams.
- Matter mode: go2rtc and a controller with Matter 1.5 Camera support.
- HomeKit mode: an Apple Home hub is recommended for remote access and automations.

Controller support for Matter cameras is still limited. Apple Home does not currently provide the Matter camera experience required by this plugin, so Apple Home users should select `homekit` mode.

## Installation

To install the published package from npm:

```bash
npm install --global matterbridge-rtsp-camera
matterbridge --add matterbridge-rtsp-camera
```

To install a local checkout or release tarball:

```bash
npm ci
npm pack
npm install --global ./matterbridge-rtsp-camera-*.tgz
matterbridge --add matterbridge-rtsp-camera
```

Open the Matterbridge frontend, configure the plugin, enable it, and restart Matterbridge.

## Configuration

```json
{
  "name": "matterbridge-rtsp-camera",
  "type": "DynamicPlatform",
  "debug": false,
  "unregisterOnShutdown": false,
  "mode": "matter",
  "go2rtcUrl": "http://127.0.0.1:1984",
  "homekitPin": "031-45-154",
  "cameras": [
    {
      "id": "front-door",
      "name": "Front Door",
      "rtspUrl": "rtsp://camera-host:8554/front-door"
    }
  ]
}
```

Camera IDs must be unique and must remain unchanged after commissioning. Changing an ID creates a new Matter or HomeKit accessory identity.

### Matter mode

Set `mode` to `matter` and set `go2rtcUrl` to the HTTP API of an existing go2rtc instance. The plugin sends each configured RTSP URL directly to go2rtc's media endpoints and does not mutate the go2rtc stream registry.

After upgrading an already commissioned bridge, a controller that cached an earlier generic endpoint profile may require Matterbridge to be removed and recommissioned.

### HomeKit mode

Set `mode` to `homekit` and choose an eight-digit `homekitPin` in `XXX-XX-XXX` form. Each camera is published as a standalone HomeKit accessory and its setup URI is written to the Matterbridge log. HomeKit mode does not use go2rtc; the RTSP URL may point directly to a camera or to a go2rtc RTSP restream.

Use a unique PIN and protect the configuration file because RTSP URLs commonly contain credentials.

## Migration from `matterbridge-camera`

Version 0.3.1 was developed under the temporary package name `matterbridge-camera`, which belongs to another npm publisher. To migrate:

1. Stop Matterbridge and back up its home directory.
2. Rename `matterbridge-camera.config.json` to `matterbridge-rtsp-camera.config.json` and change its `name` field to `matterbridge-rtsp-camera`.
3. Remove the old plugin registration, install and add `matterbridge-rtsp-camera`, then restart Matterbridge.
4. Keep every camera `id` unchanged.

The internal HomeKit UUID, MAC, and persistence namespace intentionally remain `matterbridge-camera`. Do not remove the `matterbridge-camera/homekit` directory inside the Matterbridge home directory; retaining it preserves existing Apple Home pairings.

## Limitations

- No recording, talkback, PTZ, motion sensor, or camera discovery UI is included.
- Matter mode depends on controller support for the Matter 1.5 Camera device type.
- RTSP transport and codec compatibility depend on the camera, go2rtc, and FFmpeg.
- The included camera URL is a placeholder and must be replaced.

## Development

```bash
npm ci
npm test
npm pack --dry-run
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [NOTICE.md](NOTICE.md) for project policies and acknowledgements.

## Acknowledgements

The Matter camera implementation is adapted from the ISC-licensed [MatterCameras](https://github.com/patricktd/MatterCameras) project by [Patrick Teixeira](https://github.com/patricktd), with source-history contributions from Koryx. This standalone plugin and its native HomeKit integration are maintained by [Joel Kirchmeyer](https://github.com/kirchmeyer).

The project also depends on work from the Matterbridge, matter.js, Homebridge/HAP-NodeJS, FFmpeg, ffmpeg-for-homebridge, and go2rtc communities. See [NOTICE.md](NOTICE.md) for detailed attribution.

## License

ISC. See [LICENSE](LICENSE).