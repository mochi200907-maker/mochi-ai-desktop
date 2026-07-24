import type { APIModule } from "./types";

// AI Category
import { gpt5API } from "./ai/gpt5";
import { simAPI } from "./ai/sim";
import { geminiAPI } from "./ai/gemini";

// Tools Category
import { spotifyAPI } from "./tools/spotify";

// Video Category
import { txt2videoAPI } from "./video/txt2video";
import { tiktokAPI } from "./video/tiktok";

// Search Category
import { exampleSearchAPI } from "./search/example";
import { searchAPIs } from "./search";

// Other Categories
import { randomAPIs } from "./random";
import { canvasAPIs } from "./canvas";
import { educationalAPIs } from "./educational";
import { entertainmentAPIs } from "./entertainment";

/**
 * Central registry of all API modules
 * 
 * HOW TO ADD A NEW API:
 * 1. Create your API file in the appropriate category folder (e.g., server/apis/ai/myapi.ts)
 * 2. Define your API with metadata (parameters, exampleValues, responseType)
 * 3. Import it above (e.g., import { myAPI } from "./ai/myapi";)
 * 4. Add it to the apiModules array below
 * 
 * The API will automatically appear in the client panels!
 */
export const apiModules: APIModule[] = [
  // AI
  gpt5API,
  simAPI,
  geminiAPI,
  
  // Tools & Search
  spotifyAPI,
  exampleSearchAPI,
  
  // Video
  txt2videoAPI,
  tiktokAPI,
  
  // Other categories (empty for now)
  searchAPIs,
  randomAPIs,
  canvasAPIs,
  educationalAPIs,
  entertainmentAPIs,
];
