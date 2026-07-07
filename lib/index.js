/**
 * Nastech-Termux - Main entry point
 */

import {
  configureTermux,
  getInstallStatus,
  installProot,
  installUbuntu,
  setupProotUbuntu,
  setupBionicBypassInProot,
  runInProot
} from './installer.js';
import { isAndroid } from './bionic-bypass.js';
import { spawn } from 'child_process';

const VERSION = '1.7.3';

function printBanner() {
  console.log(`
╔═══════════════════════════════════════════╗
║     Nastech-Termux v${VERSION}              ║
║     AI Agent for Android                  ║
╚═══════════════════════════════════════════╝
`);
}

function printHelp() {
  console.log(`
Usage: nastech <command> [args...]

Commands:
  setup       Full installation (proot + Ubuntu + Nastech)
  status      Check installation status
  start       Start Nastech agent (inside proot)
  shell       Open Ubuntu shell with Nastech ready
  help        Show this help message

  Any other command is passed directly to nastech in proot:
    nastech onboarding      → nastech onboarding
    nastech gateway -v      → nastech gateway -v
    nastech doctor          → nastech doctor
    nastech <anything>      → nastech <anything>

Examples:
  nastech setup             # First-time setup
  nastech start             # Start agent
  nastech onboarding        # Configure API keys
  nastech shell             # Enter Ubuntu shell
`);
}

async function runSetup() {
  console.log('Starting Nastech setup for Termux...\n');
  console.log('This will install: proot-distro → Ubuntu → Node.js → Python → uv → Nastech\n');

  if (!isAndroid()) {
    console.log('Warning: This package is designed for Android/Termux.');
    console.log('Some features may not work on other platforms.\n');
  }

  let status = getInstallStatus();

  // Step 1: Install proot-distro
  console.log('[1/8] Checking proot-distro...');
  if (!status.proot) {
    console.log('  Installing proot-distro...');
    installProot();
  } else {
    console.log('  ✓ proot-distro installed');
  }
  console.log('');

  // Step 2: Install Ubuntu
  console.log('[2/8] Checking Ubuntu in proot...');
  status = getInstallStatus();
  if (!status.ubuntu) {
    console.log('  Installing Ubuntu (this takes a while)...');
    installUbuntu();
  } else {
    console.log('  ✓ Ubuntu installed');
  }
  console.log('');

  // Step 3: Install Node.js in Ubuntu
  console.log('[3/8] Setting up Node.js in Ubuntu...');
  status = getInstallStatus();
  if (!status.nodeInProot) {
    console.log('  Installing Node.js...');
    setupProotUbuntu();
  } else {
    console.log('  ✓ Node.js already installed in proot');
  }
  console.log('');

  // Step 4: Install Python in Ubuntu
  console.log('[4/8] Setting up Python in Ubuntu...');
  status = getInstallStatus();
  if (!status.pythonInProot) {
    console.log('  Installing Python...');
    setupProotUbuntu();
  } else {
    console.log('  ✓ Python already installed in proot');
  }
  console.log('');

  // Step 5: Install uv (Python package manager)
  console.log('[5/8] Setting up uv (Python package manager)...');
  status = getInstallStatus();
  if (!status.uvInProot) {
    console.log('  Installing uv...');
  } else {
    console.log('  ✓ uv already installed in proot');
  }
  console.log('');

  // Step 6: Setup Nastech in Ubuntu
  console.log('[6/8] Setting up Nastech in Ubuntu...');
  status = getInstallStatus();
  if (!status.nastechInProot) {
    setupProotUbuntu();
  } else {
    console.log('  ✓ Nastech already installed in proot');
  }
  console.log('');

  // Step 7: Setup Bionic Bypass in proot
  console.log('[7/8] Setting up Bionic Bypass in proot...');
  setupBionicBypassInProot();
  console.log('');

  // Step 8: Configure Termux wake-lock
  console.log('[8/8] Configuring Termux...');
  configureTermux();
  console.log('');

  // Done
  console.log('═══════════════════════════════════════════');
  console.log('Setup complete!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Run onboarding: nastech onboarding');
  console.log('     → Select "Loopback (127.0.0.1)" when asked!');
  console.log('  2. Start agent:    nastech start');
  console.log('');
  console.log('Dashboard: http://127.0.0.1:18789');
  console.log('═══════════════════════════════════════════');
}

function showStatus() {
  process.stdout.write('Checking installation status...');
  const status = getInstallStatus();
  process.stdout.write('\r' + ' '.repeat(35) + '\r');

  console.log('Installation Status:\n');

  console.log('Termux:');
  console.log(`  proot-distro:     ${status.proot ? '✓ installed' : '✗ missing'}`);
  console.log(`  Ubuntu (proot):   ${status.ubuntu ? '✓ installed' : '✗ not installed'}`);
  console.log('');

  if (status.ubuntu) {
    console.log('Inside Ubuntu:');
    console.log(`  Node.js:          ${status.nodeInProot ? '✓ installed' : '✗ not installed'}`);
    console.log(`  Python:           ${status.pythonInProot ? '✓ installed' : '✗ not installed'}`);
    console.log(`  uv:               ${status.uvInProot ? '✓ installed' : '✗ not installed'}`);
    console.log(`  Nastech:          ${status.nastechInProot ? '✓ installed' : '✗ not installed'}`);
    console.log(`  Bionic Bypass:    ${status.bionicBypassInProot ? '✓ configured' : '✗ not configured'}`);
    console.log('');
  }

  if (status.proot && status.ubuntu && status.nastechInProot) {
    console.log('Status: ✓ Ready to run!');
    console.log('');
    console.log('Commands:');
    console.log('  nastech start         # Start agent');
    console.log('  nastech onboarding    # Configure API keys');
    console.log('  nastech shell         # Enter Ubuntu shell');
  } else {
    console.log('Status: ✗ Setup incomplete');
    console.log('Run: nastech setup');
  }
}

function startGateway() {
  const status = getInstallStatus();

  if (!status.proot || !status.ubuntu) {
    console.error('proot/Ubuntu not installed. Run: nastech setup');
    process.exit(1);
  }

  if (!status.nastechInProot) {
    console.error('Nastech not installed in proot. Run: nastech setup');
    process.exit(1);
  }

  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let started = false;
  const DASHBOARD_URL = 'http://127.0.0.1:18789';

  const spinner = setInterval(() => {
    if (!started) {
      process.stdout.write(`\r${frames[i++ % frames.length]} Starting Nastech agent...`);
    }
  }, 80);

  const checkDashboard = setInterval(async () => {
    if (started) return;
    try {
      const response = await fetch(DASHBOARD_URL, { method: 'HEAD', signal: AbortSignal.timeout(1000) });
      if (response.ok || response.status < 500) {
        started = true;
        clearInterval(spinner);
        clearInterval(checkDashboard);
        process.stdout.write('\r' + ' '.repeat(40) + '\r');
        console.log('✓ Nastech agent started!\n');
        console.log(`Dashboard: ${DASHBOARD_URL}`);
        console.log('Press Ctrl+C to stop\n');
        console.log('─'.repeat(45) + '\n');
      }
    } catch { /* ignore polling errors */ }
  }, 500);

  const gateway = runInProot('nastech gateway --verbose');

  gateway.on('error', (err) => {
    clearInterval(spinner);
    clearInterval(checkDashboard);
    console.error('\nFailed to start agent:', err.message);
  });

  gateway.on('close', (code) => {
    clearInterval(spinner);
    clearInterval(checkDashboard);
    if (!started) {
      console.log('\nAgent exited before starting. Run: nastech onboarding');
    }
    console.log(`Agent exited with code ${code}`);
  });
}

function runNastechCommand(args) {
  const status = getInstallStatus();

  if (!status.proot || !status.ubuntu || !status.nastechInProot) {
    console.error('Setup not complete. Run: nastech setup');
    process.exit(1);
  }

  const command = args.join(' ');
  console.log(`Running: nastech ${command}\n`);

  if (args[0] === 'onboarding') {
    console.log('TIP: Select "Loopback (127.0.0.1)" when asked for binding!\n');
  }

  const proc = runInProot(`nastech ${command}`);

  proc.on('error', (err) => {
    console.error('Failed to run command:', err.message);
  });
}

function openShell() {
  const status = getInstallStatus();

  if (!status.proot || !status.ubuntu) {
    console.error('proot/Ubuntu not installed. Run: nastech setup');
    process.exit(1);
  }

  console.log('Entering Ubuntu shell (with Bionic Bypass)...');
  console.log('Type "exit" to return to Termux\n');

  const shell = spawn('proot-distro', ['login', 'ubuntu'], {
    stdio: 'inherit'
  });

  shell.on('error', (err) => {
    console.error('Failed to open shell:', err.message);
  });
}

export async function main(args) {
  const command = args[0] || 'help';

  printBanner();

  switch (command) {
    case 'setup':
    case 'install':
      await runSetup();
      break;

    case 'status':
      showStatus();
      break;

    case 'start':
    case 'run':
      startGateway();
      break;

    case 'shell':
    case 'ubuntu':
      openShell();
      break;

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;

    default:
      runNastechCommand(args);
      break;
  }
}
