# Security Policy

## Supported versions

Security fixes are applied to the latest released version.

## Reporting a vulnerability

Do not disclose vulnerabilities, credentials, pairing codes, or private RTSP URLs in a public issue. Use GitHub's private vulnerability reporting for this repository. If that feature is unavailable, contact the maintainer privately through the contact options on [Joel Kirchmeyer's GitHub profile](https://github.com/kirchmeyer).

Include the affected version, impact, reproduction steps, and any proposed mitigation. You can expect an acknowledgement within seven days.

## Deployment guidance

Keep Matterbridge and go2rtc on a trusted network, restrict access to their management APIs, use unique HomeKit pairing codes, and protect plugin configuration files because RTSP URLs may contain camera credentials.