# Changelog

All notable changes to **vRO AI Studio** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-05-01

### Added
- **Pluggable LLM backend.** New `vroAiStudio.llmProvider` setting selects between three backends:
  - `claude` (default) — Anthropic Claude API
  - `local` — any OpenAI-compatible chat-completions endpoint (Ollama, LM Studio, vLLM, etc.)
  - `anythingllm` — AnythingLLM via its native workspace chat API
- New settings to configure local backends:
  - `vroAiStudio.localLlmEndpoint` — base URL (AnythingLLM) or full chat-completions URL (OpenAI-compatible)
  - `vroAiStudio.localLlmApiKey` — bearer token for the local LLM
  - `vroAiStudio.localLlmModel` — model name (OpenAI-compatible) or workspace slug (AnythingLLM)
- README section documenting Ollama and AnythingLLM setup.

### Changed
- `callClaude()` in `claudeClient.ts` now branches on `llmProvider` to build the correct request body, headers, endpoint path, and response parser for each backend. Anthropic behavior is unchanged when `llmProvider` is left at its default.

## [0.2.0] - 2025-04-11

### Added
- `vroAiStudio.codingStandardsFile` setting. Path to a plain-text file of team coding standards; contents are injected into the Generate and Review system prompts at call time.
- `vroAiStudio.utilityReposFile` setting (placeholder; feature not yet wired up).

## [0.1.0] - Initial release

- Generate Action, Review Code, Generate Tests, Explain Workflow, and Onboarding commands.
- Sidebar webview and floating panel surfaces.
- Auto-review on save with diagnostics in the Problems panel.
- Right-click context menu integration for `.ts` / `.js` files.

[0.3.1]: https://github.com/vgudzhev/vro-ai-studio/releases/tag/v0.3.1
[0.2.0]: https://github.com/vgudzhev/vro-ai-studio/releases/tag/v0.2.0
