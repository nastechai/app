---
name: Nastech proot install fixes
description: Root causes and fixes for the three setup failures shown in screenshots (libandroid-shmem, DNS, nsswitch)
---

## libandroid-shmem.so not found

**Rule:** Android 10+ bionic does NOT reliably honour `LD_LIBRARY_PATH` for DT_NEEDED libs of a directly-executed ELF (W^X namespace isolation). `LD_LIBRARY_PATH` alone is insufficient.

**Fix:** Set `LD_PRELOAD=$libDir/libandroid-shmem.so:$nativeLibDir/libandroid-shmem.so` in `ProcessManager.prootEnv()`. Also copy the lib from `nativeLibDir` → `libDir` (app-writable) in `BootstrapManager.setupShmem()`, called from `setupDirectories()`.

**Why two paths in LD_PRELOAD:** `libDir` copy is created by `setupShmem()` after first run; `nativeLibDir` is the APK-extracted copy available immediately. Listing both (colon-separated) gives a fallback if `setupShmem()` hasn't run yet.

## DNS failure inside proot (git clone fails)

**Rule:** Ubuntu 22.04 ships `mdns4_minimal [NOTFOUND=return]` and Ubuntu 24.04 ships `resolve [!UNAVAIL=return]` in `/etc/nsswitch.conf`'s `hosts:` line. Both contact a local resolver (127.0.0.53) not running in proot, return NOTFOUND, and short-circuit before reaching the real DNS servers in resolv.conf.

**Fix:** Patch nsswitch.conf from the Kotlin side in `ProcessManager.ensureResolvConf()` — replace the `hosts:` line with `hosts: files dns` — before every proot call. This runs on the host FS so it survives across invocations.

**Secondary fix:** Do NOT use `rm -f /etc/resolv.conf` inside a proot command. `--bind src:dst` makes proot intercept `unlink(dst)` → `unlink(src)`; after the source is deleted the bind mount is dangling and `printf ... > dst` may write nowhere. Use `printf ... >` (truncate-open, no unlink) instead.

## nastech-agent install script

The official script at `https://raw.githubusercontent.com/nastechai/nastech-agent/main/scripts/install.sh` does:
1. `git clone https://github.com/nastechai/nastech-agent.git` → needs DNS
2. Creates Python venv
3. `pip install -e '.[all]'` (or `.[termux-all]` on Termux)
4. Creates `/usr/local/bin/nastech` (FHS root layout inside proot)

Inside proot running as root on Ubuntu, `is_termux` is false → FHS layout. Run with `--skip-setup` to avoid interactive wizard.

The script does NOT run `npm install -g nastech`. The npm 404 `nastech@*` error seen in screenshots is from `install_node_deps()` running `npm install` on the nastech-agent's own package.json (which has a dep named `nastech`), which is now skipped because the DNS fix allows git clone to succeed first.
