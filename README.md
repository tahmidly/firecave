# Firecave

A desktop home for your AI coding CLIs. Firecave runs the official **Claude Code** CLI (and optionally **Gemini CLI** or your own API keys) on your machine, with a polished chat and code workspace, live remote control from your phone, and plugins that stay separate from Claude's own config.

- **Chat** and **Code** modes: plain conversation, or project work with file edits and commands
- Streams replies, tool calls, diffs and command output; Allow-once approvals for blocked actions
- Session tabs, resizable panels, context and cost readout, light and dark themes
- **Remote control** over your local network with an access token, live-synced across devices
- **Providers**: Claude Code, Gemini CLI, or OpenAI-compatible / Anthropic / Gemini APIs with your own key (encrypted with the OS keychain)
- **Plugins** (MCP servers, skill folders) stored only in Firecave

Firecave never reads or copies the CLIs' sign-in credentials. Each CLI keeps its own login.

## Requirements

- Node.js 24+
- [Claude Code](https://docs.anthropic.com/claude-code) installed and signed in (`claude auth login`)
- Optional: Gemini CLI (`gemini`, signed in once)

## Develop

```bash
npm install
npm run dev
```

## Releases

Installers are built by GitHub Actions (`.github/workflows/release.yml`) for Windows (`.exe`) and macOS (`.dmg`, `.zip`; Apple Silicon and Intel).

- Push a tag such as `v0.1.0`, or run the **Release** workflow from the Actions tab.
- Builds are unsigned by default. On macOS, right-click the app → **Open** the first time; on Windows, choose **More info → Run anyway**. Add code-signing secrets to electron-builder to remove these prompts.

Build locally: `npm run dist:win` on Windows, `npm run dist:mac` on a Mac. App icons are generated from `shared/logo.ts` with `npm run make:icon`.

## Credits

Visual design, colour tokens and icon artwork adapted from [opencode](https://github.com/anomalyco/opencode) (MIT). Fonts: Inter and IBM Plex Mono (SIL OFL). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
