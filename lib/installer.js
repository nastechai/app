/**
 * Nastech Installer - Handles environment setup for Termux
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { installBypass, getBypassScriptPath, getNodeOptions } from './bionic-bypass.js';

const HOME = process.env.HOME || '/data/data/com.termux/files/home';
const BASHRC = path.join(HOME, '.bashrc');
const ZSHRC = path.join(HOME, '.zshrc');
const PROOT_ROOTFS = '/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs';
const PROOT_UBUNTU_ROOT = path.join(PROOT_ROOTFS, 'ubuntu', 'root');

export function checkDependencies() {
  const deps = {
    node: false,
    npm: false,
    git: false,
    proot: false
  };

  try {
    execSync('node --version', { stdio: 'pipe' });
    deps.node = true;
  } catch { /* not installed */ }

  try {
    execSync('npm --version', { stdio: 'pipe' });
    deps.npm = true;
  } catch { /* not installed */ }

  try {
    execSync('git --version', { stdio: 'pipe' });
    deps.git = true;
  } catch { /* not installed */ }

  try {
    execSync('which proot-distro', { stdio: 'pipe' });
    deps.proot = true;
  } catch { /* not installed */ }

  return deps;
}

export function installTermuxDeps() {
  console.log('Installing Termux dependencies...');

  const packages = ['nodejs-lts', 'git', 'openssh', 'python'];

  try {
    execSync('pkg update -y', { stdio: 'inherit' });
    execSync(`pkg install -y ${packages.join(' ')}`, { stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error('Failed to install Termux packages:', err.message);
    return false;
  }
}

export function setupBionicBypass() {
  console.log('Setting up Bionic Bypass...');

  const scriptPath = installBypass();
  const nodeOptions = getNodeOptions();
  const exportLine = `export NODE_OPTIONS="${nodeOptions}"`;

  for (const rcFile of [BASHRC, ZSHRC]) {
    if (fs.existsSync(rcFile)) {
      const content = fs.readFileSync(rcFile, 'utf8');
      if (!content.includes('bionic-bypass')) {
        fs.appendFileSync(rcFile, `\n# Nastech Bionic Bypass\n${exportLine}\n`);
        console.log(`Updated ${path.basename(rcFile)}`);
      }
    }
  }

  process.env.NODE_OPTIONS = nodeOptions;

  return scriptPath;
}

export function installNastech() {
  console.log('Installing Nastech...');

  try {
    execSync('pip install nastech-agent[termux]', { stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error('Failed to install Nastech:', err.message);
    console.log('You may need to install it manually: pip install nastech-agent[termux]');
    return false;
  }
}

export function configureTermux() {
  console.log('Configuring Termux for background operation...');

  const wakeLockScript = path.join(HOME, '.nastech', 'wakelock.sh');
  const wakeLockDir = path.dirname(wakeLockScript);

  if (!fs.existsSync(wakeLockDir)) {
    fs.mkdirSync(wakeLockDir, { recursive: true });
  }

  const wakeLockContent = `#!/bin/bash
# Keep Termux awake while Nastech runs
termux-wake-lock
trap "termux-wake-unlock" EXIT
exec "$@"
`;

  fs.writeFileSync(wakeLockScript, wakeLockContent, 'utf8');
  fs.chmodSync(wakeLockScript, '755');

  console.log('Wake-lock script created');
  console.log('');
  console.log('IMPORTANT: Disable battery optimization for Termux in Android settings!');

  return true;
}

export function getInstallStatus() {
  const PROOT_ROOTFS = '/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs';

  // Check proot-distro
  let hasProot = false;
  try {
    execSync('command -v proot-distro', { stdio: 'pipe' });
    hasProot = true;
  } catch { /* not installed */ }

  // Check if ubuntu is installed
  let hasUbuntu = false;
  try {
    hasUbuntu = fs.existsSync(path.join(PROOT_ROOTFS, 'ubuntu'));
  } catch { /* check failed */ }

  // Check Node.js in proot
  let hasNodeInProot = false;
  if (hasUbuntu) {
    try {
      hasNodeInProot = fs.existsSync(path.join(PROOT_ROOTFS, 'ubuntu', 'usr', 'local', 'bin', 'node')) ||
                       fs.existsSync(path.join(PROOT_ROOTFS, 'ubuntu', 'usr', 'bin', 'node'));
    } catch { /* check failed */ }
  }

  // Check Python in proot
  let hasPythonInProot = false;
  if (hasUbuntu) {
    try {
      hasPythonInProot = fs.existsSync(path.join(PROOT_ROOTFS, 'ubuntu', 'usr', 'bin', 'python3'));
    } catch { /* check failed */ }
  }

  // Check uv in proot
  let hasUvInProot = false;
  if (hasUbuntu) {
    try {
      hasUvInProot = fs.existsSync(path.join(PROOT_ROOTFS, 'ubuntu', 'root', '.local', 'bin', 'uv')) ||
                    fs.existsSync(path.join(PROOT_ROOTFS, 'ubuntu', 'usr', 'local', 'bin', 'uv'));
    } catch { /* check failed */ }
  }

  // Check if nastech exists in proot ubuntu
  let hasNastechInProot = false;
  if (hasUbuntu) {
    try {
      // Check pip-installed nastech
      const nastechBin = path.join(PROOT_ROOTFS, 'ubuntu', 'root', '.local', 'bin', 'nastech');
      const nastechBin2 = path.join(PROOT_ROOTFS, 'ubuntu', 'usr', 'local', 'bin', 'nastech');
      hasNastechInProot = fs.existsSync(nastechBin) || fs.existsSync(nastechBin2);
    } catch { /* check failed */ }

    // Fallback: proot exec check
    if (!hasNastechInProot) {
      try {
        execSync('proot-distro login ubuntu -- bash -lc "command -v nastech"', { stdio: 'pipe', timeout: 30000 });
        hasNastechInProot = true;
      } catch { /* not installed */ }
    }
  }

  // Check bionic bypass in proot
  let hasBionicBypassInProot = false;
  try {
    const prootBypassPath = path.join(PROOT_ROOTFS, 'ubuntu', 'root', '.nastech', 'bionic-bypass.js');
    hasBionicBypassInProot = fs.existsSync(prootBypassPath);
  } catch { /* check failed */ }

  return {
    proot: hasProot,
    ubuntu: hasUbuntu,
    nodeInProot: hasNodeInProot,
    pythonInProot: hasPythonInProot,
    uvInProot: hasUvInProot,
    nastechInProot: hasNastechInProot,
    bionicBypassInProot: hasBionicBypassInProot,
    // Legacy compat
    openClawInProot: hasNastechInProot,
    bionicBypass: fs.existsSync(getBypassScriptPath()),
    nodeOptions: process.env.NODE_OPTIONS?.includes('bionic-bypass') || false,
    nastech: (() => {
      try {
        execSync('command -v nastech', { stdio: 'pipe' });
        return true;
      } catch { return false; }
    })()
  };
}

export function installProot() {
  console.log('Installing proot-distro...');
  try {
    execSync('pkg install -y proot-distro', { stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error('Failed to install proot-distro:', err.message);
    return false;
  }
}

export function installUbuntu() {
  console.log('Installing Ubuntu in proot (this may take a while)...');
  try {
    execSync('proot-distro install ubuntu', { stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error('Failed to install Ubuntu:', err.message);
    return false;
  }
}

export function setupProotUbuntu() {
  console.log('Setting up Node.js, Python, uv and Nastech in Ubuntu...');

  const setupScript = `
    apt update && apt upgrade -y
    apt install -y curl wget git python3 python3-pip python3-venv
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt install -y nodejs
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    pip install nastech-agent[termux]
  `;

  try {
    execSync(`proot-distro login ubuntu -- bash -c '${setupScript}'`, { stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error('Failed to setup Ubuntu:', err.message);
    return false;
  }
}

export function setupBionicBypassInProot() {
  console.log('Setting up Bionic Bypass in proot Ubuntu...');

  const bypassScript = `
const os = require('os');
const originalNetworkInterfaces = os.networkInterfaces;
os.networkInterfaces = function() {
  try {
    const interfaces = originalNetworkInterfaces.call(os);
    if (interfaces && Object.keys(interfaces).length > 0) {
      return interfaces;
    }
  } catch (e) {}
  return {
    lo: [{
      address: '127.0.0.1',
      netmask: '255.0.0.0',
      family: 'IPv4',
      mac: '00:00:00:00:00:00',
      internal: true,
      cidr: '127.0.0.1/8'
    }]
  };
};
`;

  const prootBypassPath = path.join(PROOT_UBUNTU_ROOT, '.nastech', 'bionic-bypass.js');
  const prootBypassDir = path.dirname(prootBypassPath);

  try {
    if (!fs.existsSync(prootBypassDir)) {
      fs.mkdirSync(prootBypassDir, { recursive: true });
    }
    fs.writeFileSync(prootBypassPath, bypassScript, 'utf8');

    const prootBashrc = path.join(PROOT_UBUNTU_ROOT, '.bashrc');
    const exportLine = 'export NODE_OPTIONS="--require /root/.nastech/bionic-bypass.js"';

    let bashrcContent = '';
    if (fs.existsSync(prootBashrc)) {
      bashrcContent = fs.readFileSync(prootBashrc, 'utf8');
    }

    if (!bashrcContent.includes('bionic-bypass')) {
      fs.appendFileSync(prootBashrc, `\n# Nastech Bionic Bypass\n${exportLine}\n`);
    }

    console.log('Bionic Bypass configured in proot Ubuntu');
    return true;
  } catch (err) {
    console.error('Failed to setup Bionic Bypass in proot:', err.message);
    return false;
  }
}

export function runInProot(command) {
  const nodeOptions = '--require /root/.nastech/bionic-bypass.js';
  return spawn('proot-distro', ['login', 'ubuntu', '--', 'bash', '-c', `export NODE_OPTIONS="${nodeOptions}" && ${command}`], {
    stdio: 'inherit'
  });
}

export function runInProotWithCallback(command, onFirstOutput) {
  const nodeOptions = '--require /root/.nastech/bionic-bypass.js';
  let firstOutput = true;

  const proc = spawn('proot-distro', ['login', 'ubuntu', '--', 'bash', '-c', `export NODE_OPTIONS="${nodeOptions}" && ${command}`], {
    stdio: ['inherit', 'pipe', 'pipe']
  });

  proc.stdout.on('data', (data) => {
    if (firstOutput) {
      firstOutput = false;
      onFirstOutput();
    }
    process.stdout.write(data);
  });

  proc.stderr.on('data', (data) => {
    if (firstOutput) {
      firstOutput = false;
      onFirstOutput();
    }
    const str = data.toString();
    if (!str.includes('proot warning') && !str.includes("can't sanitize")) {
      process.stderr.write(data);
    }
  });

  return proc;
}
