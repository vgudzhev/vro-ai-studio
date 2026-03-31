# vRO AI Studio

AI-powered VS Code extension for **VMware Aria Orchestrator (vRO)** developers. Generate actions, review code, write tests, and explain workflows — all without leaving the editor.

## Features

| Command | Description |
|---|---|
| **Generate Action** | Describe what you need in plain English — get production-ready TypeScript |
| **Review This File** | vRO-specific code review with diagnostics in the Problems panel |
| **Generate Tests** | Full Jasmine spec file with mocked vRO APIs |
| **Explain Selected Code** | Plain English, Markdown, or Runbook output for selected code |
| **Onboarding** | Scans your environment (Java, Maven, Node) and provides setup guidance |

**Context menu** — right-click any `.ts` / `.js` file to access Review, Generate Tests, and Explain directly.

**Auto-review on save** — enable `vroAiStudio.autoReviewOnSave` to get vRO-specific diagnostics in the Problems panel every time you save.

---

## Requirements

- Node.js 18+
- npm 9+
- VS Code 1.85+
- An [Anthropic API key](https://console.anthropic.com/)

---

## Build

```bash
# Clone the repo
git clone https://github.com/vgudzhev/vro-ai-studio.git
cd vro-ai-studio

# Install dev dependencies
npm install

# Compile TypeScript → out/
npm run compile

# Watch mode (recompiles on change)
npm run watch

# Lint
npm run lint
```

To launch the extension inside a VS Code **Extension Development Host**, press **F5** in VS Code.

---

## Package

Build a `.vsix` file for distribution:

```bash
npm run package
# Produces: vro-ai-studio-0.1.0.vsix
```

---

## Install

### From a local `.vsix`

```bash
code --install-extension vro-ai-studio-0.1.0.vsix
```

Or in VS Code: **Extensions** → `...` menu → **Install from VSIX…**

### From the marketplace _(when published)_

```
ext install vro-ai-studio
```

---

## Configuration

Open **Settings** and search for `vroAiStudio`, or edit `settings.json` directly:

| Setting | Default | Description |
|---|---|---|
| `vroAiStudio.apiKey` | `""` | Anthropic API key (falls back to `ANTHROPIC_API_KEY` env var) |
| `vroAiStudio.apiEndpoint` | `https://api.anthropic.com/v1/messages` | Override for air-gapped / internal proxy deployments |
| `vroAiStudio.model` | `claude-sonnet-4-20250514` | Claude model to use |
| `vroAiStudio.autoReviewOnSave` | `false` | Show vRO diagnostics in the Problems panel on every save |
| `vroAiStudio.insertGeneratedCode` | `true` | Auto-insert generated action code at cursor position |

### Air-gapped / proxy setup

```json
{
  "vroAiStudio.apiEndpoint": "https://your-internal-proxy.corp/v1/messages",
  "vroAiStudio.apiKey": "your-internal-key"
}
```

The extension uses Node's built-in `https` module — **no external runtime dependencies**.

### Suggested keybindings

Add to your `keybindings.json`:

```json
[
  { "key": "ctrl+shift+v r", "command": "vroAiStudio.reviewCode" },
  { "key": "ctrl+shift+v t", "command": "vroAiStudio.generateTests" },
  { "key": "ctrl+shift+v e", "command": "vroAiStudio.explainWorkflow" },
  { "key": "ctrl+shift+v g", "command": "vroAiStudio.openPanel" }
]
```

---

## Project Structure

```
vro-ai-studio/
├── src/
│   ├── extension.ts            # Entry point, command registration, message routing
│   ├── claudeClient.ts         # Claude API client (HTTPS, 90s timeout, system prompts)
│   ├── diagnosticsProvider.ts  # Auto-review on save → VS Code Problems panel
│   ├── onboardingProvider.ts   # Environment scanner + onboarding prompt
│   └── webviewContent.ts       # Loads media/webview.html, injects CSP nonce
├── media/
│   ├── webview.html            # Tabbed sidebar UI (Generate / Review / Tests / Explain / Onboard)
│   ├── webview.js              # Client-side tab switching and message posting
│   └── icon.svg
├── package.json                # Extension manifest and contributes
└── tsconfig.json
```

---

## Contributing

Contributions are welcome. Please follow these steps:

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Install dependencies** and make sure the project compiles cleanly:
   ```bash
   npm install
   npm run compile
   npm run lint
   ```

3. **Test your changes** by pressing **F5** in VS Code to launch the Extension Development Host.

4. **Commit** with a clear, descriptive message:
   ```bash
   git commit -m "feat: add support for X"
   ```

5. **Push** your branch and open a **Pull Request** against `main`.

### Guidelines

- Keep runtime dependencies at zero — use only `vscode`, `https`, `http`, `child_process`, `fs`, `path`, `os`
- Maintain strict TypeScript — no implicit `any`
- Target **ES2020 / CommonJS** output — no ESM syntax
- One `src/*.ts` file compiles to one `out/*.js` — avoid circular imports
- Add a brief description of your change in the PR body

---

## License

MIT
