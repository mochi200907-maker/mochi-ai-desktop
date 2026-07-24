export interface APIEndpoint {
  id: string;
  name: string;
  category: "AI" | "Search" | "Downloader" | "Tools" | "Video" | "Random" | "Canvas" | "Educational" | "Entertainment";
  endpoint: string;
  description: string;
  parameters: APIParameter[];
  exampleValues?: Record<string, string>;
  responseType?: "json" | "image" | "video" | "audio";
}

export interface APIParameter {
  name: string;
  type: "text" | "url" | "number";
  required: boolean;
  description: string;
  placeholder?: string;
}

// API Base URL - using empty string for relative paths (same server)
const API_BASE_URL = ""; // Using relative paths since frontend and backend run on same port

export const API_ENDPOINTS: APIEndpoint[] = [
  {
    id: "chatgpt5",
    name: "ChatGPT-5",
    category: "AI",
    endpoint: `${API_BASE_URL}/api/GPT5`,
    description: "Advanced AI chat with GPT-5 model featuring web search, reasoning, and coding capabilities",
    parameters: [
      { name: "prompt", type: "text", required: true, description: "Your message or question", placeholder: "What is the meaning of life?" },
      { name: "uid", type: "text", required: true, description: "Unique user ID for conversation memory", placeholder: "user123" },
      { name: "name", type: "text", required: false, description: "Your name (optional)", placeholder: "John Doe" },
    ],
    exampleValues: {
      prompt: "Explain quantum computing in simple terms",
      uid: "demo_user",
      name: "Developer"
    }
  },
  {
    id: "gemini",
    name: "Gemini 2.5-Flash",
    category: "AI",
    endpoint: `${API_BASE_URL}/api/gemini`,
    description: "Google's Gemini 2.5 Flash model with vision capabilities for text and image analysis",
    parameters: [
      { name: "prompt", type: "text", required: true, description: "Your prompt or question", placeholder: "Describe this image in detail" },
      { name: "imageurl", type: "url", required: false, description: "Image URL for vision analysis", placeholder: "https://example.com/image.jpg" },
    ],
    exampleValues: {
      prompt: "What can you help me with?",
      imageurl: ""
    }
  },
  {
    id: "sim",
    name: "Sim",
    category: "AI",
    endpoint: `${API_BASE_URL}/api/sim`,
    description: "Chat with Sim, a friendly 18-year-old Filipina AI with personality and chat memory",
    parameters: [
      { name: "prompt", type: "text", required: true, description: "Your message", placeholder: "Kumusta ka?" },
      { name: "uid", type: "text", required: true, description: "User ID for memory", placeholder: "user456" },
      { name: "name", type: "text", required: false, description: "Your name", placeholder: "Maria" },
    ],
    exampleValues: {
      prompt: "Hello! How are you?",
      uid: "demo_user",
      name: "Guest"
    }
  },
  {
    id: "txt2video",
    name: "Text2Video",
    category: "Video",
    endpoint: `${API_BASE_URL}/api/txt2video`,
    description: "Generate creative videos from text descriptions using AI",
    parameters: [
      { name: "prompt", type: "text", required: true, description: "Describe the video you want", placeholder: "A pixel art queen on her throne" },
    ],
    exampleValues: {
      prompt: "A beautiful sunset over the ocean with waves"
    },
    responseType: "video"
  },
  {
    id: "wikipedia",
    name: "Wikipedia",
    category: "Search",
    endpoint: `${API_BASE_URL}/wikipedia`,
    description: "Search Wikipedia and get relevant images from articles",
    parameters: [
      { name: "query", type: "text", required: true, description: "Search query", placeholder: "Artificial Intelligence" },
      { name: "limit", type: "number", required: false, description: "Number of images", placeholder: "5" },
    ],
    exampleValues: {
      query: "Philippines",
      limit: "5"
    },
    responseType: "image"
  },
  {
    id: "spotify-search",
    name: "Spotify",
    category: "Search",
    endpoint: `${API_BASE_URL}/api/spotify`,
    description: "Search for songs, artists, and albums on Spotify",
    parameters: [
      { name: "q", type: "text", required: true, description: "Search query", placeholder: "Bohemian Rhapsody" },
    ],
    exampleValues: {
      q: "Imagine Dragons"
    }
  },
  {
    id: "tiktok",
    name: "TikTok",
    category: "Video",
    endpoint: `${API_BASE_URL}/api/tiktok`,
    description: "Search TikTok videos by keywords",
    parameters: [
      { name: "keywords", type: "text", required: true, description: "Search keywords", placeholder: "funny cats" },
    ],
    exampleValues: {
      keywords: "dance challenge"
    },
    responseType: "video"
  },
  {
    id: "spotify-dl",
    name: "Spotify Downloader",
    category: "Downloader",
    endpoint: `${API_BASE_URL}/api/spotidl`,
    description: "Download songs from Spotify with metadata and cover art",
    parameters: [
      { name: "url", type: "url", required: true, description: "Spotify track URL", placeholder: "https://open.spotify.com/track/..." },
    ],
    exampleValues: {
      url: "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp"
    },
    responseType: "audio"
  },
];
