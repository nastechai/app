/**
 * Replit development server for Nastech-Termux
 * Serves an info/status page on port 5000
 */

import http from 'http';
import { readFileSync } from 'fs';

const PORT = 5000;
const HOST = '0.0.0.0';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nastech-Termux v${pkg.version}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #0d1117;
      color: #e6edf3;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container { max-width: 720px; width: 100%; }
    .header { text-align: center; margin-bottom: 2.5rem; }
    .badge {
      display: inline-block;
      background: #238636;
      color: #fff;
      font-size: 0.75rem;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      margin-bottom: 1rem;
      font-weight: 600;
      letter-spacing: 0.05em;
    }
    h1 { font-size: 2.2rem; font-weight: 700; color: #58a6ff; margin-bottom: 0.5rem; }
    .subtitle { color: #8b949e; font-size: 1rem; }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.25rem;
    }
    .card h2 {
      font-size: 1rem;
      font-weight: 600;
      color: #f0f6fc;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .card h2 .icon { font-size: 1.1rem; }
    .cmd-list { list-style: none; }
    .cmd-list li {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid #21262d;
    }
    .cmd-list li:last-child { border-bottom: none; }
    code {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 0.2rem 0.55rem;
      font-family: 'Cascadia Code', 'Fira Code', monospace;
      font-size: 0.85rem;
      color: #79c0ff;
      white-space: nowrap;
    }
    .cmd-desc {
      color: #8b949e;
      font-size: 0.875rem;
      line-height: 1.5;
      padding-top: 0.15rem;
    }
    .step-list { list-style: none; counter-reset: steps; }
    .step-list li {
      counter-increment: steps;
      display: flex;
      gap: 0.75rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid #21262d;
      font-size: 0.875rem;
      color: #c9d1d9;
      line-height: 1.5;
    }
    .step-list li:last-child { border-bottom: none; }
    .step-list li::before {
      content: counter(steps);
      background: #1f6feb;
      color: #fff;
      border-radius: 50%;
      width: 1.4rem;
      height: 1.4rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
      flex-shrink: 0;
      margin-top: 0.1rem;
    }
    .note {
      background: #1c2128;
      border-left: 3px solid #58a6ff;
      border-radius: 0 8px 8px 0;
      padding: 0.75rem 1rem;
      font-size: 0.85rem;
      color: #8b949e;
      line-height: 1.6;
    }
    .note strong { color: #e6edf3; }
    .footer {
      text-align: center;
      margin-top: 2rem;
      color: #484f58;
      font-size: 0.8rem;
    }
    .footer a { color: #58a6ff; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">v${pkg.version}</div>
      <h1>Nastech-Termux</h1>
      <p class="subtitle">AI Agent CLI for Android &amp; Termux</p>
    </div>

    <div class="card">
      <h2><span class="icon">⚡</span> Quick Start (in Termux)</h2>
      <ul class="step-list">
        <li>Install: <code>npm install -g nastech-termux</code></li>
        <li>Run setup: <code>nastech setup</code></li>
        <li>Install Node.js inside Ubuntu proot</li>
        <li>Install Python + uv inside Ubuntu proot</li>
        <li>Install Nastech agent: <code>pip install nastech-agent[termux]</code></li>
        <li>Configure Bionic Bypass for Android networking</li>
        <li>Configure Termux wake-lock for background operation</li>
        <li>Configure API keys: <code>nastech onboarding</code> — select <strong>Loopback (127.0.0.1)</strong></li>
      </ul>
    </div>

    <div class="card">
      <h2><span class="icon">🛠</span> CLI Commands</h2>
      <ul class="cmd-list">
        <li><code>nastech setup</code><span class="cmd-desc">Full install: proot-distro → Ubuntu → Node.js → Python → uv → Nastech</span></li>
        <li><code>nastech status</code><span class="cmd-desc">Check installation status of all components</span></li>
        <li><code>nastech start</code><span class="cmd-desc">Start the Nastech AI agent inside proot</span></li>
        <li><code>nastech shell</code><span class="cmd-desc">Open an Ubuntu shell with Bionic Bypass active</span></li>
        <li><code>nastech onboarding</code><span class="cmd-desc">Configure your AI provider API keys</span></li>
        <li><code>nastech gateway</code><span class="cmd-desc">Start the messaging gateway (Telegram, Discord, Slack, WhatsApp…)</span></li>
        <li><code>nastech &lt;cmd&gt;</code><span class="cmd-desc">Pass any command directly to nastech inside proot</span></li>
      </ul>
    </div>

    <div class="card">
      <h2><span class="icon">🌐</span> Supported AI Providers</h2>
      <ul class="cmd-list">
        <li><code>Anthropic</code><span class="cmd-desc">Claude models via the Anthropic API</span></li>
        <li><code>OpenAI</code><span class="cmd-desc">GPT models via the OpenAI API</span></li>
        <li><code>Google Gemini</code><span class="cmd-desc">Gemini models via Google AI API</span></li>
        <li><code>OpenRouter</code><span class="cmd-desc">Any model via OpenRouter aggregator</span></li>
        <li><code>+ more</code><span class="cmd-desc">Any provider supported by the Nastech agent</span></li>
      </ul>
    </div>

    <div class="note">
      <strong>Note:</strong> This project is designed to run on Android devices in Termux.
      The Replit environment is used for development and code browsing only.
      To use the CLI, install it on your Android device via Termux:
      <code>npm install -g nastech-termux</code>
    </div>

    <div class="footer">
      <a href="${pkg.homepage}" target="_blank">GitHub</a> &middot;
      <a href="${pkg.bugs.url}" target="_blank">Report Issues</a> &middot;
      ${pkg.license} License &middot; nastechai
    </div>
  </div>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(PORT, HOST, () => {
  console.log(`Nastech-Termux info server running at http://${HOST}:${PORT}`);
});
