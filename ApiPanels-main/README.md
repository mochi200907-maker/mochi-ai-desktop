# Norch REST API Panel

A beautiful, modern API testing panel for your Norch REST API collection. Built by April Manalo.

## Features

- 🎨 Stunning purple/pink gradient design with dark theme
- 🧪 Interactive test panels for each API endpoint
- 📊 Real-time response display with syntax highlighting
- 🖼️ Automatic image/video preview for media responses
- 📋 One-click code examples (cURL, JavaScript)
- ⚡ Fast response times with status indicators
- 🎯 Category organization (AI, Search, Downloader)

## Setup

### 1. Configure Your API URLs

Update the `API_BASE_URL` in `shared/api-schema.ts`:

```typescript
const API_BASE_URL = "https://your-api-domain.com";
// Or for local testing:
// const API_BASE_URL = "http://localhost:3000";
```

### 2. Start Your APIs

Make sure your API servers are running:

- **ChatGPT-5**: Should be accessible at `{API_BASE_URL}/api/GPT5`
- **Gemini 2.5-Flash**: Should be accessible at `{API_BASE_URL}/api/gemini`
- **Sim**: Should be accessible at `{API_BASE_URL}/api/sim`
- **Text2Video**: Should be accessible at `{API_BASE_URL}/api/txt2video`
- **Wikipedia**: Should be accessible at `{API_BASE_URL}/wikipedia`
- **Spotify Search**: Should be accessible at `{API_BASE_URL}/api/spotify`
- **TikTok**: Should be accessible at `{API_BASE_URL}/tiktok`
- **Spotify Downloader**: Should be accessible at `{API_BASE_URL}/api/spotidl`

### 3. Start the Panel

```bash
npm install
npm run dev
```

The panel will be available at `http://localhost:5000`

## API Categories

### AI
- **ChatGPT-5**: Advanced reasoning and web search
- **Gemini 2.5-Flash**: Vision AI with image analysis
- **Sim**: Conversational AI with personality
- **Text2Video**: AI video generation

### Search
- **Wikipedia**: Search with image results
- **Spotify**: Music search
- **TikTok**: Video search

### Downloader
- **Spotify Downloader**: Download tracks with metadata

## Credits

All API responses include:
```json
{
  "author": "April Manalo",
  ...
}
```

Built with ❤️ by April Manalo
