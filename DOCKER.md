# Docker

## Backend

Build and run the backend API:

```sh
docker compose up --build backend
```

The backend is exposed at:

```txt
http://localhost:3000
```

Pass API keys or other settings from your shell when needed:

```sh
OPENAI_API_KEY=your_key docker compose up --build backend
```

On Windows PowerShell:

```powershell
$env:OPENAI_API_KEY="your_key"
docker compose up --build backend
```

## Extension

Build the browser extension into `extension/dist`:

```sh
docker compose --profile build-extension up --build extension-build
```

Then load `extension/dist` as an unpacked extension in Chrome or Edge.
