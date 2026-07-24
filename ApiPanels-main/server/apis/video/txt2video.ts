import axios from "axios";
import type { APIModule } from "../types";

export const txt2videoAPI: APIModule = {
  endpoints: [
    {
      name: "Text2Video",
      category: "Video",
      description: "Generate creative videos from text descriptions using AI",
      path: "/api/txt2video",
      method: "GET",
      parameters: [
        { name: "prompt", type: "text", required: true, description: "Describe the video you want", placeholder: "A pixel art queen on her throne" },
      ],
      exampleValues: {
        prompt: "A beautiful sunset over the ocean with waves"
      },
      responseType: "video",
      handler: async (req, res) => {
        const prompt = req.query.prompt as string;

        if (!prompt) {
          return res.status(400).json({
            success: false,
            message: "Missing 'prompt' parameter",
            author: "April Manalo"
          });
        }

        try {
          // Step 1: Generate video key
          const { data: step1 } = await axios.post('https://soli.aritek.app/txt2videov3', {
            deviceID: Math.random().toString(16).substr(2, 8) + Math.random().toString(16).substr(2, 8),
            prompt,
            used: [],
            versionCode: 51,
          }, {
            headers: {
              authorization: 'eyJzdWIiwsdeOiIyMzQyZmczNHJ0MzR0weMzQiLCJuYW1lIjorwiSm9objMdf0NTM0NT',
              'content-type': 'application/json; charset=utf-8',
              'accept-encoding': 'gzip',
              'user-agent': 'okhttp/4.11.0',
            },
          });

          // Step 2: Get video URL
          const { data: step2 } = await axios.post('https://soli.aritek.app/video', {
            keys: [step1.key],
          }, {
            headers: {
              authorization: 'eyJzdWIiwsdeOiIyMzQyZmczNHJ0MzR0weMzQiLCJuYW1lIjorwiSm9objMdf0NTM0NT',
              'content-type': 'application/json; charset=utf-8',
              'accept-encoding': 'gzip',
              'user-agent': 'okhttp/4.11.0',
            },
          });

          const videoUrl = step2.datas?.[0]?.url || null;

          if (!videoUrl) {
            return res.status(404).json({
              success: false,
              message: "Unable to generate video",
              author: "April Manalo"
            });
          }

          res.json({
            author: "April Manalo",
            success: true,
            status: "success",
            prompt,
            videoUrl,
            timestamp: new Date().toISOString(),
          });
        } catch (error: any) {
          console.error("Error generating video:", error.message);
          res.status(500).json({
            success: false,
            status: "error",
            message: "Failed to generate video",
            error: error.message,
            author: "April Manalo"
          });
        }
      }
    }
  ]
};
