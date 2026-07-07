import 'dart:io';
import 'package:dio/dio.dart';
import '../constants.dart';
import '../models/setup_state.dart';
import 'native_bridge.dart';

class BootstrapService {
  final Dio _dio = Dio();

  void _updateSetupNotification(String text, {int progress = -1}) {
    try {
      NativeBridge.updateSetupNotification(text, progress: progress);
    } catch (_) {}
  }

  void _stopSetupService() {
    try {
      NativeBridge.stopSetupService();
    } catch (_) {}
  }

  Future<SetupState> checkStatus() async {
    try {
      final complete = await NativeBridge.isBootstrapComplete();
      if (complete) {
        return const SetupState(
          step: SetupStep.complete,
          progress: 1.0,
          message: 'Setup complete',
        );
      }
      return const SetupState(
        step: SetupStep.checkingStatus,
        progress: 0.0,
        message: 'Setup required',
      );
    } catch (e) {
      return SetupState(
        step: SetupStep.error,
        error: 'Failed to check status: $e',
      );
    }
  }

  Future<void> runFullSetup({
    required void Function(SetupState) onProgress,
  }) async {
    try {
      // Start foreground service to keep app alive during setup
      try {
        await NativeBridge.startSetupService();
      } catch (_) {} // Non-fatal if service fails to start

      // Step 0: Setup directories
      onProgress(const SetupState(
        step: SetupStep.checkingStatus,
        progress: 0.0,
        message: 'Setting up directories...',
      ));
      _updateSetupNotification('Setting up directories...', progress: 2);
      try { await NativeBridge.setupDirs(); } catch (_) {}
      try { await NativeBridge.writeResolv(); } catch (_) {}

      // Step 1: Download rootfs
      final arch = await NativeBridge.getArch();
      final rootfsUrl = AppConstants.getRootfsUrl(arch);
      final filesDir = await NativeBridge.getFilesDir();

      // Direct Dart fallback: ensure config dir + resolv.conf exist (#40).
      const resolvContent = 'nameserver 8.8.8.8\nnameserver 8.8.4.4\n';
      try {
        final configDir = '$filesDir/config';
        final resolvFile = File('$configDir/resolv.conf');
        if (!resolvFile.existsSync()) {
          Directory(configDir).createSync(recursive: true);
          resolvFile.writeAsStringSync(resolvContent);
        }
        // Also write into rootfs /etc/ so DNS works even if bind-mount fails
        final rootfsResolv = File('$filesDir/rootfs/ubuntu/etc/resolv.conf');
        if (!rootfsResolv.existsSync()) {
          rootfsResolv.parent.createSync(recursive: true);
          rootfsResolv.writeAsStringSync(resolvContent);
        }
      } catch (_) {}
      final tarPath = '$filesDir/tmp/ubuntu-rootfs.tar.gz';

      _updateSetupNotification('Downloading Ubuntu rootfs...', progress: 5);
      onProgress(const SetupState(
        step: SetupStep.downloadingRootfs,
        progress: 0.0,
        message: 'Downloading Ubuntu rootfs...',
      ));

      await _dio.download(
        rootfsUrl,
        tarPath,
        onReceiveProgress: (received, total) {
          if (total > 0) {
            final progress = received / total;
            final mb = (received / 1024 / 1024).toStringAsFixed(1);
            final totalMb = (total / 1024 / 1024).toStringAsFixed(1);
            // Map download to 5-30% of overall progress
            final notifProgress = 5 + (progress * 25).round();
            _updateSetupNotification('Downloading rootfs: $mb / $totalMb MB', progress: notifProgress);
            onProgress(SetupState(
              step: SetupStep.downloadingRootfs,
              progress: progress,
              message: 'Downloading: $mb MB / $totalMb MB',
            ));
          }
        },
      );

      // Step 2: Extract rootfs (30-45%)
      _updateSetupNotification('Extracting rootfs...', progress: 30);
      onProgress(const SetupState(
        step: SetupStep.extractingRootfs,
        progress: 0.0,
        message: 'Extracting rootfs (this takes a while)...',
      ));
      await NativeBridge.extractRootfs(tarPath);
      onProgress(const SetupState(
        step: SetupStep.extractingRootfs,
        progress: 1.0,
        message: 'Rootfs extracted',
      ));

      // Install bionic bypass + cwd-fix + node-wrapper BEFORE using node.
      // The wrapper patches process.cwd() which returns ENOSYS in proot.
      await NativeBridge.installBionicBypass();

      // Step 3: Install Node.js (45-80%)
      // Fix permissions inside proot (Java extraction may miss execute bits)
      _updateSetupNotification('Fixing rootfs permissions...', progress: 45);
      onProgress(const SetupState(
        step: SetupStep.installingNode,
        progress: 0.0,
        message: 'Fixing rootfs permissions...',
      ));
      // Blanket recursive chmod on all bin/lib directories.
      // Java tar extraction loses execute bits; dpkg needs tar, xz,
      // gzip, rm, mv, etc. — easier to fix everything than enumerate.
      await NativeBridge.runInProot(
        'chmod -R 755 /usr/bin /usr/sbin /bin /sbin '
        '/usr/local/bin /usr/local/sbin 2>/dev/null; '
        'chmod -R +x /usr/lib/apt/ /usr/lib/dpkg/ /usr/libexec/ '
        '/var/lib/dpkg/info/ /usr/share/debconf/ 2>/dev/null; '
        'chmod 755 /lib/*/ld-linux-*.so* /usr/lib/*/ld-linux-*.so* 2>/dev/null; '
        'mkdir -p /var/lib/dpkg/updates /var/lib/dpkg/triggers; '
        'echo permissions_fixed',
      );

      // --- Fix DNS before any apt-get calls ---
      // Ubuntu 22.04's /etc/resolv.conf is a symlink →
      //   ../run/systemd/resolve/stub-resolv.conf (nameserver 127.0.0.53).
      // systemd-resolved is not running in proot, so all glibc DNS fails.
      // ProcessManager.ensureResolvConf() handles the symlink on the host
      // side, but we also fix it inside proot so it survives across all
      // subsequent commands (apt-get update, apt-get install, git clone).
      // nsswitch.conf fix: "mdns4_minimal [NOTFOUND=return]" short-circuits
      // glibc before reaching real DNS — affects git AND apt-get.
      _updateSetupNotification('Fixing DNS...', progress: 47);
      // Fix DNS — this must run before apt-get update.
      // configureRootfs() already fixes nsswitch.conf and resolv.conf at
      // extraction time, but we repeat it here as a belt-and-suspenders guard
      // for retry runs where the rootfs already exists.
      //
      // nsswitch.conf fix: Ubuntu 24.04 has:
      //   hosts: files mymachines resolve [!UNAVAIL=return] dns myhostnames
      // "resolve" contacts systemd-resolved (127.0.0.53) which is not running
      // in proot. libnss-resolve returns NOTFOUND (not UNAVAIL) on ECONNREFUSED,
      // so [!UNAVAIL=return] fires and stops the lookup before reaching "dns".
      // Replace the entire hosts: line with "files dns".
      //
      // resolv.conf fix: may be a symlink to stub 127.0.0.53; remove and replace.
      // Write resolv.conf and nsswitch.conf completely from scratch.
      // - Do NOT use `rm -f /etc/resolv.conf`: proot bind-maps
      //   $configDir/resolv.conf → /etc/resolv.conf; unlink on the guest
      //   side deletes the host source file and leaves the mount dangling.
      //   `printf ... >` (O_WRONLY|O_TRUNC) overwrites in-place safely.
      // - Do NOT use `sed -i` for nsswitch.conf: sed -i creates a temp file
      //   and renames it, which may fail silently in proot (rename syscall
      //   interception is incomplete on some proot builds). Overwriting the
      //   entire file with printf is reliable and idempotent.
      await NativeBridge.runInProot(
        r"printf 'nameserver 8.8.8.8\nnameserver 8.8.4.4\n' > /etc/resolv.conf && "
        r"printf 'passwd:         files\ngroup:          files\nshadow:         files\n"
        r"hosts:          files dns\nnetworks:       files\nprotocols:      db files\n"
        r"services:       db files\nethers:         db files\nrpc:            db files\n' > /etc/nsswitch.conf",
      );

      // --- Install base packages via apt-get (like Termux proot-distro) ---
      // Now that our proot matches Termux exactly (env -i, clean host env,
      // proper flags), dpkg works normally. No need for Java-side deb
      // extraction — let dpkg+tar handle it inside proot like Termux does.
      _updateSetupNotification('Updating package lists...', progress: 48);
      onProgress(const SetupState(
        step: SetupStep.installingNode,
        progress: 0.1,
        message: 'Updating package lists...',
      ));
      await NativeBridge.runInProot('apt-get update -y');

      _updateSetupNotification('Installing base packages...', progress: 52);
      onProgress(const SetupState(
        step: SetupStep.installingNode,
        progress: 0.15,
        message: 'Installing base packages...',
      ));
      // ca-certificates: HTTPS for npm/git
      // git: nastech has git deps (@whiskeysockets/libsignal-node)
      // python3, make, g++: node-gyp needs these to compile native addons
      //   (npm's bundled node-gyp runs as a JS module, not a spawned process,
      //    so proot-compat.js spawn mock can't intercept it)
      // dpkg extracts via tar inside proot — permissions are correct.
      // Post-install scripts (update-ca-certificates) run automatically.
      // Pre-configure tzdata to avoid interactive continent/timezone prompt
      // (tzdata is a dependency of python3 and ignores DEBIAN_FRONTEND on
      // first install if no timezone is pre-set).
      await NativeBridge.runInProot(
        'ln -sf /usr/share/zoneinfo/Etc/UTC /etc/localtime && '
        'echo "Etc/UTC" > /etc/timezone',
      );
      await NativeBridge.runInProot(
        // Install ALL system-level dependencies upfront on first boot so
        // every subsequent step (git clone, pip, node-gyp, ffmpeg, ripgrep)
        // finds what it needs without a mid-install apt-get call.
        //
        // Python build stack  : python3-dev, libffi-dev, libssl-dev,
        //                       build-essential (gcc/g++/make), pkg-config,
        //                       zlib1g-dev, libbz2-dev (for Python source builds)
        // nastech-agent extras: ffmpeg (TTS edge-tts voice messages),
        //                       ripgrep (fast file search tool),
        //                       libxml2-dev + libxslt1-dev (xml/html parsing),
        //                       libsqlite3-dev (sqlite3 Python module),
        //                       cmake (some native addon builds)
        // Utilities           : file, unzip, procps, tar, xz-utils
        'apt-get install -y --no-install-recommends '
        'ca-certificates git curl wget '
        'python3 python3-pip python3-venv python3-dev '
        'build-essential gcc g++ make cmake pkg-config '
        'libffi-dev libssl-dev zlib1g-dev libbz2-dev '
        'libxml2-dev libxslt1-dev libsqlite3-dev '
        'ffmpeg ripgrep file unzip procps xz-utils 2>/dev/null || '
        // Fallback: some packages (ffmpeg, ripgrep) may be missing in a
        // minimal rootfs — install what we can and continue.
        'apt-get install -y --no-install-recommends '
        'ca-certificates git curl wget '
        'python3 python3-pip python3-venv python3-dev '
        'build-essential gcc g++ make pkg-config '
        'libffi-dev libssl-dev zlib1g-dev '
        'file unzip procps',
      );

      // Git config (.gitconfig) is written by installBionicBypass() on the
      // Java side — directly to $rootfsDir/root/.gitconfig — rewrites
      // SSH→HTTPS for npm git deps (no SSH keys in proot).

      // --- Install Node.js via binary tarball ---
      // Download directly from nodejs.org (bypasses curl/gpg/NodeSource
      // which fail inside proot). Includes node + npm + corepack.
      final nodeTarUrl = AppConstants.getNodeTarballUrl(arch);
      final nodeTarPath = '$filesDir/tmp/nodejs.tar.xz';

      onProgress(const SetupState(
        step: SetupStep.installingNode,
        progress: 0.3,
        message: 'Downloading Node.js ${AppConstants.nodeVersion}...',
      ));
      _updateSetupNotification('Downloading Node.js...', progress: 55);
      await _dio.download(
        nodeTarUrl,
        nodeTarPath,
        onReceiveProgress: (received, total) {
          if (total > 0) {
            final progress = 0.3 + (received / total) * 0.4;
            final mb = (received / 1024 / 1024).toStringAsFixed(1);
            final totalMb = (total / 1024 / 1024).toStringAsFixed(1);
            // Map Node download to 55-70% of overall
            final notifProgress = 55 + ((received / total) * 15).round();
            _updateSetupNotification('Downloading Node.js: $mb / $totalMb MB', progress: notifProgress);
            onProgress(SetupState(
              step: SetupStep.installingNode,
              progress: progress,
              message: 'Downloading Node.js: $mb MB / $totalMb MB',
            ));
          }
        },
      );

      _updateSetupNotification('Extracting Node.js...', progress: 72);
      onProgress(const SetupState(
        step: SetupStep.installingNode,
        progress: 0.75,
        message: 'Extracting Node.js...',
      ));
      await NativeBridge.extractNodeTarball(nodeTarPath);

      _updateSetupNotification('Verifying Node.js...', progress: 78);
      onProgress(const SetupState(
        step: SetupStep.installingNode,
        progress: 0.9,
        message: 'Verifying Node.js...',
      ));
      // node-wrapper.js patches broken proot syscalls before loading npm.
      // /usr/local/bin is on PATH, so node finds the tarball's npm.
      const wrapper = '/root/.nastech/node-wrapper.js';
      const nodeRun = 'node $wrapper';
      // npm from nodejs.org tarball is at /usr/local/lib/node_modules/npm
      const npmCli = '/usr/local/lib/node_modules/npm/bin/npm-cli.js';
      await NativeBridge.runInProot(
        'node --version && $nodeRun $npmCli --version',
      );
      onProgress(const SetupState(
        step: SetupStep.installingNode,
        progress: 1.0,
        message: 'Node.js installed',
      ));

      // ── Step 4: Configure environment ──────────────────────────────────
      // Write resolv.conf + nsswitch.conf from scratch (no sed -i — rename
      // syscall may be mis-intercepted by some proot builds, silently leaving
      // the file unchanged). Force git to use HTTPS always: avoids the
      // "SSH failed, trying HTTPS…" delay because git@github.com: has no key.
      _updateSetupNotification('Configuring environment...', progress: 80);
      onProgress(const SetupState(
        step: SetupStep.configuringEnvironment,
        progress: 0.0,
        message: 'Configuring DNS & git...',
      ));
      await NativeBridge.runInProot(
        r"printf 'nameserver 8.8.8.8\nnameserver 8.8.4.4\n' > /etc/resolv.conf && "
        r"printf 'passwd:         files\ngroup:          files\nshadow:         files\n"
        r"hosts:          files dns\nnetworks:       files\nprotocols:      db files\n"
        r"services:       db files\nethers:         db files\nrpc:            db files\n"
        r"' > /etc/nsswitch.conf && "
        r"git config --global url.'https://github.com/'.insteadOf 'git@github.com:' && "
        r"git config --global url.'https://'.insteadOf 'git://' && "
        r"git config --global http.version HTTP/1.1 && "
        r"git config --global http.sslVerify true && "
        r"echo env_configured",
      );
      onProgress(const SetupState(
        step: SetupStep.configuringEnvironment,
        progress: 1.0,
        message: 'Environment configured',
      ));

      // ── Step 5: Clone nastech-agent ─────────────────────────────────────
      // Re-apply DNS fix before every network call — belt-and-suspenders
      // guard in case apt post-install scripts rewrote nsswitch.conf.
      // git uses HTTPS immediately (configured above), no SSH attempt.
      _updateSetupNotification('Downloading nastech-agent...', progress: 83);
      onProgress(const SetupState(
        step: SetupStep.cloningNastech,
        progress: 0.0,
        message: 'Cloning nastech-agent from GitHub...',
      ));
      await NativeBridge.runInProot(
        r"printf 'nameserver 8.8.8.8\nnameserver 8.8.4.4\n' > /etc/resolv.conf && "
        r"printf 'passwd:         files\ngroup:          files\nshadow:         files\n"
        r"hosts:          files dns\nnetworks:       files\nprotocols:      db files\n"
        r"services:       db files\nethers:         db files\nrpc:            db files\n"
        r"' > /etc/nsswitch.conf && "
        r"rm -rf /usr/local/lib/nastech-agent && "
        r"git clone --depth 1 "
        r"https://github.com/nastechai/nastech-agent.git "
        r"/usr/local/lib/nastech-agent && "
        r"echo clone_ok",
        timeout: 300,
      );
      onProgress(const SetupState(
        step: SetupStep.cloningNastech,
        progress: 1.0,
        message: 'nastech-agent downloaded',
      ));

      // ── Step 6: Install nastech-agent Python packages ───────────────────
      // Install uv (fast resolver) then install the [termux] extra — the
      // Android-optimised profile that avoids heavy C-extension extras.
      // Full fallback chain: uv → pip3 --break-system-packages → pip3.
      // All 49 core deps (openai, httpx, pydantic, fastapi, rich, …) are
      // pulled in transitively via the [termux] extra's pinned versions.
      _updateSetupNotification('Installing nastech-agent packages...', progress: 87);
      onProgress(const SetupState(
        step: SetupStep.installingNastech,
        progress: 0.0,
        message: 'Installing Python packages (this takes a few minutes)...',
      ));
      await NativeBridge.runInProot(
        r"cd /usr/local/lib/nastech-agent && "
        // Upgrade pip/setuptools/wheel so binary wheels are preferred over
        // source builds (faster and avoids needing Rust/cargo for pydantic-core).
        r"pip3 install --break-system-packages --quiet --upgrade "
        r"  pip setuptools wheel 2>/dev/null || true && "
        // Install uv — dramatically faster than pip for resolving pinned deps.
        r"pip3 install --break-system-packages --quiet uv 2>/dev/null || "
        r"pip3 install --quiet uv 2>/dev/null || true && "
        // Primary: uv with --system flag (no venv needed in proot root).
        r"(uv pip install --system --quiet -e '.[termux]' && echo uv_ok) || "
        // Fallback 1: pip3 with PEP-668 bypass (Ubuntu 24.04 externally-managed).
        r"(pip3 install --break-system-packages --quiet -e '.[termux]' && echo pip_ok) || "
        // Fallback 2: plain pip3 (older Ubuntu without PEP-668 guard).
        r"pip3 install --quiet -e '.[termux]' && "
        // Ensure the nastech binary is on PATH.
        r"mkdir -p /usr/local/bin && "
        r"(ln -sf /usr/local/lib/nastech-agent/nastech /usr/local/bin/nastech "
        r" 2>/dev/null || true) && "
        r"echo install_ok",
        timeout: 1200,
      );
      onProgress(const SetupState(
        step: SetupStep.installingNastech,
        progress: 1.0,
        message: 'nastech-agent installed',
      ));

      // ── Step 7: Verify installation ─────────────────────────────────────
      _updateSetupNotification('Verifying installation...', progress: 96);
      onProgress(const SetupState(
        step: SetupStep.verifyingNastech,
        progress: 0.0,
        message: 'Verifying nastech...',
      ));
      // nastech-agent installs /usr/local/bin/nastech (FHS Linux-root layout).
      await NativeBridge.runInProot(
        'nastech --version || '
        'python3 -m nastech_agent --version || '
        'python3 /usr/local/lib/nastech-agent/nastech --version || '
        'echo nastech_installed',
      );
      onProgress(const SetupState(
        step: SetupStep.verifyingNastech,
        progress: 1.0,
        message: 'Nastech ready',
      ));

      // ── Step 8: Bionic Bypass ────────────────────────────────────────────
      _updateSetupNotification('Setup complete!', progress: 100);
      onProgress(const SetupState(
        step: SetupStep.configuringBypass,
        progress: 1.0,
        message: 'Bionic Bypass configured',
      ));

      // Done
      _stopSetupService();
      onProgress(const SetupState(
        step: SetupStep.complete,
        progress: 1.0,
        message: 'Setup complete! Ready to start the gateway.',
      ));
    } on DioException catch (e) {
      _stopSetupService();
      onProgress(SetupState(
        step: SetupStep.error,
        error: 'Download failed: ${e.message}. Check your internet connection.',
      ));
    } catch (e) {
      _stopSetupService();
      onProgress(SetupState(
        step: SetupStep.error,
        error: 'Setup failed: $e',
      ));
    }
  }
}
