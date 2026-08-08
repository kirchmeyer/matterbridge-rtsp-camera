# Contributing

Bug reports, documentation improvements, tests, and focused code changes are welcome.

Before opening an issue, search existing issues and remove credentials, pairing codes, and private network details from logs. For substantial changes, open an issue first so the behavior and compatibility impact can be discussed.

## Development

1. Fork the repository and create a branch from `main`.
2. Install dependencies with `npm ci`.
3. Make a focused change and add or update tests where practical.
4. Run `npm test` and `npm pack --dry-run`.
5. Open a pull request describing the behavior, rationale, and validation performed.

Changes must preserve stable camera identities, avoid modifying shared go2rtc stream definitions, and keep Matter and HomeKit publication modes exclusive.

By contributing, you agree that your contribution is licensed under the ISC license used by this repository. Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).