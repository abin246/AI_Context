# ContextIQ

ContextIQ is a client-only Chrome Extension that brings AI actions to selected text on any website. Users provide their own Groq API key, which is stored locally with the Chrome Storage API. No backend, account system, external database, or server-side AI billing is required.

## Features

- Floating toolbar on text selection
- Context menu actions for selected text
- Side panel with AI responses and conversation history
- Popup with quick access to settings and side panel
- Dedicated settings page for provider, API key, model, theme, prompts, and privacy controls
- Direct Groq API integration from the Manifest V3 service worker
- Local request throttling and local-only storage

## Text Actions

- Summarize
- Rewrite
- Translate
- Explain
- Simplify
- Expand
- Improve Writing
- Fix Grammar
- Custom Prompt
- Ask Question

## Project Structure

```text
contextiq/
  extension/
    public/
      manifest.json
      content.css
    src/
      background/
      content/
      popup/
      settings/
      shared/
      sidepanel/
```

The existing `backend/` folder is not required for the client-only MVP.

## Install For Development

```bash
cd extension
npm install
npm run build
```

Then load the extension:

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `extension/dist`.
5. Open ContextIQ Settings and save a Groq API key.

## Build

```bash
cd extension
npm run build
```

The production extension is emitted to `extension/dist`.

## Chrome Web Store Package

Build first, then ZIP the contents of `extension/dist`.

PowerShell:

```powershell
cd extension
npm run build
Compress-Archive -Path dist\* -DestinationPath contextiq-chrome-extension.zip -Force
```

Upload `contextiq-chrome-extension.zip` in the Chrome Web Store Developer Dashboard.

## Storage

ContextIQ stores local data under Chrome Storage:

```json
{
  "apiKey": "",
  "provider": "groq",
  "model": "llama-3.3-70b-versatile",
  "theme": "system",
  "prompts": []
}
```

API keys are used only in requests to `https://api.groq.com` and are not logged.

## Groq Models

- `llama-3.3-70b-versatile`
- `llama-3.1-8b-instant`
- `deepseek-r1-distill-llama-70b`
- `qwen-qwq-32b`

## Tech Stack

- Manifest V3
- React
- TypeScript
- Vite
- Chrome Storage API
- Groq API

## License

MIT
