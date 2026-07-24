import axios from "axios";
import type { APIModule } from "../types";

// SECURITY: API key MUST be set via environment variable
// Set GROQ_API_KEY_GPT5 in your deployment platform
const GROQ_KEY_GPT5 = process.env.GROQ_API_KEY_GPT5 || "";

const chatMemory = new Map<string, { history: any[], lastUsed: number, name: string }>();

// Auto-reset memory every hour
setInterval(() => {
  console.log("🧹 Auto-resetting GPT5 chat memory...");
  chatMemory.clear();
}, 60 * 60 * 1000);

function toFancy(text: string): string {
  const normal = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const fancy = "𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃";

  let result = "";
  for (let j = 0; j < text.length; j++) {
    const c = text[j];
    const i = normal.indexOf(c);
    result += i !== -1 ? fancy[i] : c;
  }
  return result;
}

export const gpt5API: APIModule = {
  endpoints: [
    {
      name: "ChatGPT-5",
      category: "AI",
      description: "Advanced AI chat with GPT-5 model featuring web search, reasoning, and coding capabilities",
      path: "/api/GPT5",
      method: "GET",
      parameters: [
        { name: "prompt", type: "text", required: true, description: "Your message or question", placeholder: "What is the meaning of life?" },
        { name: "uid", type: "text", required: true, description: "Unique user ID for conversation memory", placeholder: "user123" },
        { name: "name", type: "text", required: false, description: "Your name (optional)", placeholder: "John Doe" },
      ],
      exampleValues: {
        prompt: "Explain quantum computing in simple terms",
        uid: "demo_user",
        name: "Developer"
      },
      responseType: "json",
      handler: async (req, res) => {
        if (!GROQ_KEY_GPT5) {
          return res.status(500).json({ 
            error: "API key not configured. Set GROQ_API_KEY_GPT5 environment variable.", 
            author: "April Manalo" 
          });
        }
        
        try {
          const { prompt, uid, name } = req.query;
          if (!prompt || !uid) {
            return res.status(400).json({ error: "Missing prompt or uid", author: "April Manalo" });
          }

          const userName = (name as string)?.trim() || "Unknown";

          const systemPrompt = `
You are ChatGPT, based on the GPT-5 model — a highly advanced reasoning, coding, and web research AI assistant.

You respond naturally, helpfully, and conversationally with clear explanations.

When you perform a web search or cite online sources, include:
🌐sources:
example.com
wikipedia.com
(each source on a new line)
`;

          if (!chatMemory.has(uid as string)) {
            chatMemory.set(uid as string, { history: [], lastUsed: Date.now(), name: userName });
          }

          const userData = chatMemory.get(uid as string)!;
          userData.lastUsed = Date.now();
          userData.name = userName;

          userData.history.push({ role: "user", content: prompt });
          if (userData.history.length > 20) {
            userData.history = userData.history.slice(-20);
          }

          const messages = [
            { role: "system", content: systemPrompt },
            ...userData.history,
          ];

          const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
              model: "groq/compound",
              messages,
              temperature: 0.7,
              max_completion_tokens: 512,
              compound_custom: {
                tools: {
                  enabled_tools: ["web_search", "code_interpreter", "visit_website"],
                },
              },
            },
            {
              headers: {
                Authorization: `Bearer ${GROQ_KEY_GPT5}`,
                "Content-Type": "application/json",
                "Groq-Model-Version": "latest",
              },
            }
          );

          let reply = response.data?.choices?.[0]?.message?.content?.trim() || "Wala akong makitang sagot.";
          reply = reply.replace(/\*\*(.*?)\*\*/g, (_: string, word: string) => toFancy(word));
          reply = reply.replace(/[?!@&]/g, "").trim();

          userData.history.push({ role: "assistant", content: reply });

          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.json({
            success: true,
            reply,
            uid,
            name: userName,
            memoryCount: userData.history.length,
            author: "April Manalo"
          });

        } catch (error: any) {
          console.error("❌ Error in GPT5 API:", error.response?.data || error.message);
          res.status(500).json({
            error: "Failed to contact Groq API",
            details: error.response?.data || error.message,
            author: "April Manalo"
          });
        }
      }
    }
  ]
};
