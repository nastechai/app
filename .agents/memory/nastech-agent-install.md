---
name: nastech-agent install path
description: Where the Python nastech-agent installer puts its files vs the old npm assumption
---

## Install layout (Python install.sh, running as root on Linux FHS)
- Repo cloned to: `/usr/local/lib/nastech-agent/`
- Command binary at: `/usr/local/bin/nastech`

## Old (wrong) npm assumption
The app previously checked `/usr/local/lib/node_modules/nastech/package.json` — this is the npm global install path. The project never used npm.

## Completion check
`isBootstrapComplete()` and `getBootstrapStatus()` must check `/usr/local/bin/nastech` (the binary), not the npm node_modules path.

## createBinWrappers
This Kotlin function reads npm package.json to build shell wrappers. It must NOT be called — the Python installer creates the binary itself. Calling it throws because the npm path doesn't exist.

## bash path
Ubuntu 22.04 uses merged-/usr layout: `/bin` is a symlink to `/usr/bin`.
Accept EITHER `/bin/bash` OR `/usr/bin/bash` in completion checks.

**Why:** Using the wrong path caused the app to loop setup forever even after a successful install.
