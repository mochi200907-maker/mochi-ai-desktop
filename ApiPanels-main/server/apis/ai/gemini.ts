import axios from "axios";
import type { APIModule } from "../types";

// SECURITY: API key MUST be set via environment variable
// Set GEMINI_API_KEY in your deployment platform
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

export const geminiAPI: APIModule = {
  endpoints: [
    {
      name: "Gemini 2.5-Flash",
      category: "AI",
      description: "Google's Gemini 2.5 Flash model with vision capabilities for text and image analysis",
      path: "/api/gemini",
      method: "GET",
      parameters: [
        { name: "prompt", type: "text", required: true, description: "Your prompt or question", placeholder: "Describe this image in detail" },
        { name: "imageurl", type: "url", required: false, description: "Image URL for vision analysis", placeholder: "https://example.com/image.jpg" },
      ],
      exampleValues: {
        prompt: "What can you help me with?",
        imageurl: ""
      },
      responseType: "json",
      handler: async (req, res) => {
        if (!GEMINI_KEY) {
          return res.status(500).json({ 
            error: "API key not configured. Set GEMINI_API_KEY environment variable.", 
            author: "April Manalo" 
          });
        }
        
        try {
          const { prompt, imageurl } = req.query;

          if (!prompt) {
            return res.status(400).json({ error: "Missing 'prompt' query parameter.", author: "April Manalo" });
          }

          const parts: any[] = [{ text: prompt }];

          if (imageurl) {
            const imageResponse = await axios.get(imageurl as string, { responseType: "arraybuffer" });
            const base64Image = Buffer.from(imageResponse.data, "binary").toString("base64");

            parts.push({
              inline_data: {
                mime_type: "image/jpeg",
                data: base64Image
              }
            });
          }

          const body = {
            contents: [{ parts }]
          };

          const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
            body
          );

          const output = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ No response generated.";

          res.json({
            model: "gemini-2.5-flash",
            prompt,
            imageurl: imageurl || null,
            response: output,
            author: "April Manalo"
          });
        } catch (error: any) {
          console.error("❌ Gemini Flash Error:", error.response?.data || error.message);
          res.status(500).json({
            error: "Failed to connect to Gemini Flash API",
            details: error.response?.data || error.message,
            author: "April Manalo"
          });
        }
      }
    }
  ]
};
