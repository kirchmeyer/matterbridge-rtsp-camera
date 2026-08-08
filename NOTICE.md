# Notices and Acknowledgements

`matterbridge-rtsp-camera` is maintained by [Joel Kirchmeyer](https://github.com/kirchmeyer), who created the standalone Matterbridge plugin integration and native HomeKit publication mode.

The Matter camera implementation was adapted from [MatterCameras](https://github.com/patricktd/MatterCameras), whose package declares the ISC license. Git history for the extracted source files identifies these upstream authors:

- [Patrick Teixeira (`patricktd`)](https://github.com/patricktd), creator and primary author of MatterCameras.
- Koryx, contributor to the MatterCameras source history.

Their work established the Matter 1.5 camera endpoint, go2rtc WebRTC exchange, image handling, and related compatibility behavior used here. The original copyright notices are preserved in [LICENSE](LICENSE).

This plugin is built for [Matterbridge](https://github.com/Luligu/matterbridge), created and maintained by Luca Liguori, and follows conventions from the Matterbridge plugin template.

Runtime functionality relies on these separately licensed projects:

- [matter.js](https://github.com/project-chip/matter.js) for Matter protocol support.
- [HAP-NodeJS](https://github.com/homebridge/HAP-NodeJS) and the [Homebridge](https://github.com/homebridge/homebridge) community for HomeKit Accessory Protocol support.
- [ffmpeg-for-homebridge](https://github.com/homebridge/ffmpeg-for-homebridge) and FFmpeg for native HomeKit media transport.
- [go2rtc](https://github.com/AlexxIT/go2rtc) for RTSP ingest and WebRTC media exchange in Matter mode.

Those projects and their names remain the property of their respective owners. Inclusion here does not imply endorsement, affiliation, or certification.