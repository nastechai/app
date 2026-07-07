# Nastech-Termux

AI Agent CLI for Android & Termux. Installs and runs the [nastech-agent](https://github.com/nastechai/nastech-agent) inside a Ubuntu proot environment on Android, managed via a Flutter app.

## Project structure

- `lib/` — Node.js CLI package (`nastech-termux` on npm). Entry point: `bin/nastech`.
- `flutter_app/` — Android Flutter app that sets up Ubuntu proot and runs the agent.
  - `flutter_app/lib/services/bootstrap_service.dart` — Orchestrates the 5-step setup wizard.
  - `flutter_app/android/app/src/main/kotlin/com/nxg/nastechproot/ProcessManager.kt` — Builds proot commands; sets `LD_PRELOAD` and `LD_LIBRARY_PATH` for `libandroid-shmem.so`.
  - `flutter_app/android/app/src/main/kotlin/com/nxg/nastechproot/BootstrapManager.kt` — Extracts rootfs, patches DNS/nsswitch, copies native libs.
- `scripts/fetch-proot-binaries.sh` — Downloads proot, libtalloc, and libandroid-shmem from Termux packages for all ABIs.
- `.github/workflows/` — 13 CI/CD workflows (build, lint, analyze, security, etc.).
- `server.js` — Replit info page (port 5000). Not part of the Android app.

## Running on Replit

`node server.js` serves a static info page at port 5000. The actual CLI runs on Android/Termux, not on Replit.

## Key fixes (2025-07-07)

### `libandroid-shmem.so not found` (proot can't start)
- `ProcessManager.kt`: Added `LD_PRELOAD=$libDir/libandroid-shmem.so:$nativeLibDir/libandroid-shmem.so` to `prootEnv()`. Android 10+ bionic may not honour `LD_LIBRARY_PATH` for DT_NEEDED deps of a directly-executed ELF — `LD_PRELOAD` injects it unconditionally.
- `BootstrapManager.kt`: Added `setupShmem()` that copies `libandroid-shmem.so` from `nativeLibDir` → `libDir` (app-writable). Called from `setupDirectories()`.

### DNS failure (`Could not resolve host: github.com`)
- `ProcessManager.kt` `ensureResolvConf()`: now also patches `/etc/nsswitch.conf` on the host side before every proot call, replacing the `hosts:` line with `files dns`. Ubuntu 22.04/24.04 ships `mdns4_minimal [NOTFOUND=return]` / `resolve [!UNAVAIL=return]` which blocks DNS before reaching real nameservers.
- `bootstrap_service.dart`: Removed `rm -f /etc/resolv.conf` from the in-proot DNS fix command. `rm -f` on a `--bind`-mounted path deletes the bind source on the host, leaving the mount dangling; `printf ... >` (truncate) is safe instead.

## User preferences

(none recorded yet)
