# How to Add a New API

This guide shows you how to add a new API endpoint that will automatically appear in the client panels.

## Quick Start

### 1. Create Your API File

Create a new file in the appropriate category folder (e.g., `server/apis/ai/myapi.ts`):

```typescript
import type { APIModule } from "../types";

export const myAPI: APIModule = {
  endpoints: [
    {
      name: "My API Name",
      category: "AI",  // AI, Tools, Video, Search, Downloader, etc.
      description: "What your API does",
      path: "/api/myapi",
      method: "GET",
      
      // REQUIRED for client UI:
      parameters: [
        { 
          name: "query", 
          type: "text",  // "text", "url", or "number"
          required: true, 
          description: "What this parameter does", 
          placeholder: "Example value" 
        },
      ],
      exampleValues: {
        query: "test query"
      },
      responseType: "json",  // "json", "image", "video", or "audio"
      
      // Your API handler:
      handler: async (req, res) => {
        const { query } = req.query;
        
        if (!query) {
          return res.status(400).json({
            success: false,
            message: "Missing 'query' parameter",
            author: "April Manalo"
          });
        }
        
        // Your API logic here
        res.json({
          success: true,
          result: "Your result",
          author: "April Manalo"
        });
      }
    }
  ]
};
```

### 2. Register in Registry

Open `server/apis/registry.ts` and add:

```typescript
// Add import at the top
import { myAPI } from "./ai/myapi";

// Add to apiModules array
export const apiModules: APIModule[] = [
  // ... existing APIs
  myAPI,  // Add your API here
];
```

### 3. Done!

That's it! Your API will now:
- ✅ Automatically appear in the client sidebar
- ✅ Have a test panel with parameter inputs
- ✅ Show in the API list at `/api/list`
- ✅ Be callable via the proxy at `/api/proxy`

## Environment Variables for API Keys

**NEVER hardcode API keys!** Use environment variables:

```typescript
const API_KEY = process.env.MY_API_KEY || "";

if (!API_KEY) {
  return res.status(500).json({ 
    error: "API key not configured. Set MY_API_KEY environment variable." 
  });
}
```

Then set the environment variable in your deployment platform (Replit Secrets, Render, etc.)

## Available Categories

- `AI` - AI models and chat endpoints
- `Tools` - Utility and helper APIs
- `Video` - Video generation and search
- `Search` - Search and lookup services
- `Downloader` - Download and conversion APIs
- `Random` - Fun or random content
- `Canvas` - Image manipulation
- `Educational` - Learning and tutorials
- `Entertainment` - Games, music, movies

## Response Types

- `json` - Standard JSON response (default)
- `image` - Image URL in response
- `video` - Video URL in response
- `audio` - Audio/download URL in response

The client UI will automatically display images/videos inline based on responseType.

## Testing

After adding your API:
1. The server auto-restarts
2. Go to the homepage - your API appears in the list
3. Click it to open the test panel
4. Fill in parameters and click "Execute"

## Example: Complete API File

See `server/apis/search/example.ts` for a working example of a complete API with all metadata.
