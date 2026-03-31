# vRO AI Studio — VS Code Extension

AI-powered developer tooling for **VMware Aria Orchestrator** — action generator, code reviewer, test generator, and workflow explainer — all inside VS Code.

## Features

| Command | What it does |
|---|---|
| **Generate Action** | Describe in plain English → get production TypeScript |
| **Review This File** | vRO-specific code review with inline diagnostics |
| **Generate Tests** | Full Jasmine spec file with mocked vRO APIs |
| **Explain Selected Code** | Plain English / Markdown / Runbook output |

### Context menu integration
Right-click any `.ts` / `.js` file in the editor to access Review, Generate Tests, and Explain directly.

### Auto-review on save
Enable `vroAiStudio.autoReviewOnSave` to get vRO-specific diagnostics in the Problems panel every time you save.

## Installation

### From marketplace (when published)
```
ext install vro-ai-studio
```

### Air-gapped / local `.vsix`
```bash
# Build the .vsix
npm install
npm run package

# Install in VS Code
code --install-extension vro-ai-studio-0.1.0.vsix
```

## Configuration

| Setting | Default | Description |
|---|---|---|
| `vroAiStudio.apiKey` | `""` | Anthropic API key (or set `ANTHROPIC_API_KEY` env var) |
| `vroAiStudio.apiEndpoint` | `https://api.anthropic.com/v1/messages` | Override for air-gapped / internal proxy |
| `vroAiStudio.model` | `claude-sonnet-4-20250514` | Claude model to use |
| `vroAiStudio.autoReviewOnSave` | `false` | Show diagnostics in Problems panel on save |
| `vroAiStudio.insertGeneratedCode` | `true` | Insert generated action at cursor |

### Air-gapped setup
Point `vroAiStudio.apiEndpoint` at your internal Claude proxy:
```json
{
  "vroAiStudio.apiEndpoint": "https://your-internal-proxy.corp/v1/messages",
  "vroAiStudio.apiKey": "your-internal-key"
}
```
The extension uses Node's built-in `https` module — no external dependencies at runtime.

## Build requirements

- Node.js 18+
- npm 9+
- VS Code 1.85+

```bash
npm install          # install dev dependencies
npm run compile      # compile TypeScript
npm run watch        # watch mode during development
npm run package      # build .vsix for distribution
```

## Project structure

```
vro-ai-studio/
├── src/
│   ├── extension.ts          # Entry point, command registration
│   ├── claudeClient.ts       # API client (streaming, air-gap ready)
│   ├── diagnosticsProvider.ts # Auto-review on save → Problems panel
│   └── webviewContent.ts     # Sidebar/panel HTML
├── media/
│   └── icon.svg
├── package.json              # Extension manifest + contributes
└── tsconfig.json
```

## Keyboard shortcuts (suggested)

Add to your `keybindings.json`:
```json
[
  { "key": "ctrl+shift+v r", "command": "vroAiStudio.reviewCode" },
  { "key": "ctrl+shift+v t", "command": "vroAiStudio.generateTests" },
  { "key": "ctrl+shift+v e", "command": "vroAiStudio.explainWorkflow" },
  { "key": "ctrl+shift+v g", "command": "vroAiStudio.openPanel" }
]
```

## License
MIT
