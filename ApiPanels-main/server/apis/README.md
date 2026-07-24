# API Organization Guide

## 📁 Folder Structure

```
server/apis/
├── types.ts                 # Type definitions
├── index.ts                 # Auto-registration system
├── ai/                      # AI Category
│   ├── gpt5.ts
│   ├── sim.ts
│   └── gemini.ts
├── tools/                   # Tools Category
│   └── spotify.ts
├── video/                   # Video Category
│   ├── txt2video.ts
│   └── tiktok.ts
├── random/                  # Random Category
│   └── index.ts
├── canvas/                  # Canvas Category
│   └── index.ts
├── educational/             # Educational Category
│   └── index.ts
└── entertainment/           # Entertainment Category
    └── index.ts
```

## 🎯 Categories Available

- **AI** - AI chatbots, language models, AI assistants
- **Tools** - Utility APIs (search, download, conversion)
- **Video** - Video generation, search, processing
- **Random** - Fun/random APIs
- **Canvas** - Image manipulation, drawing
- **Educational** - Learning, tutorials, facts
- **Entertainment** - Games, music, movies

## 📝 How to Add a New API

### Step 1: Create Your API File

Choose the right category folder and create a new `.ts` file:

```typescript
// Example: server/apis/tools/weather.ts
import axios from "axios";
import type { APIModule } from "../types";

export const weatherAPI: APIModule = {
  endpoints: [
    {
      name: "Weather Info",              // Display name
      category: "Tools",                 // Category (must match folder)
      description: "Get weather info",   // Optional description
      path: "/api/weather",              // API endpoint path
      method: "GET",                     // HTTP method
      handler: async (req, res) => {
        const city = req.query.city as string;
        
        if (!city) {
          return res.status(400).json({
            error: "Missing city parameter",
            author: "April Manalo"
          });
        }
        
        try {
          // Your API logic here
          const weatherData = await getWeatherData(city);
          
          res.json({
            success: true,
            data: weatherData,
            author: "April Manalo"
          });
        } catch (error: any) {
          res.status(500).json({
            error: "Failed to fetch weather",
            author: "April Manalo"
          });
        }
      }
    }
  ]
};
```

### Step 2: Register Your API

Open `server/apis/index.ts` and add your import and registration:

```typescript
// Add import at the top
import { weatherAPI } from "./tools/weather";

// Add to apiModules array
const apiModules: APIModule[] = [
  // ... existing APIs
  weatherAPI,  // Add your API here
];
```

That's it! Your API will automatically be registered when the server starts.

## 🔑 API Key Management

For APIs that need keys, add them at the top of your file with a warning:

```typescript
// WARNING: API keys are hardcoded for Render deployment
// For production, use environment variables or secret management
const MY_API_KEY = "your-key-here";
```

## ✨ Best Practices

1. **Always include error handling** - Use try/catch blocks
2. **Return consistent responses** - Include `author: "April Manalo"`
3. **Validate inputs** - Check required query/body parameters
4. **Add descriptive names** - Make it clear what the API does
5. **Group related endpoints** - Multiple endpoints can be in one file

## 📊 Example: Multiple Endpoints in One File

```typescript
export const musicAPI: APIModule = {
  endpoints: [
    {
      name: "Search Songs",
      category: "Entertainment",
      path: "/api/music/search",
      method: "GET",
      handler: async (req, res) => { /* ... */ }
    },
    {
      name: "Get Lyrics",
      category: "Entertainment",
      path: "/api/music/lyrics",
      method: "GET",
      handler: async (req, res) => { /* ... */ }
    },
    {
      name: "Download Song",
      category: "Entertainment",
      path: "/api/music/download",
      method: "POST",
      handler: async (req, res) => { /* ... */ }
    }
  ]
};
```

## 🚀 Testing Your API

After adding your API:

1. Server automatically restarts
2. Check console for: `✅ Registered [Category] METHOD /path - Name`
3. Test with: `curl http://localhost:5000/api/your-endpoint`

## 📋 Current APIs

Run the server to see all registered APIs with:
```
🚀 Total APIs registered: X
📊 APIs by category: { AI: X, Tools: X, Video: X, ... }
```
