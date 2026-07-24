import axios from "axios";
import type { APIModule } from "../types";

export const tiktokAPI: APIModule = {
  endpoints: [
    {
      name: "TikTok Search",
      category: "Video",
      description: "Search TikTok videos by keywords",
      path: "/api/tiktok",
      method: "GET",
      parameters: [
        { 
          name: "keywords", 
          type: "text", 
          required: true, 
          description: "Search keywords", 
          placeholder: "funny cats" 
        },
      ],
      exampleValues: {
        keywords: "dance challenge"
      },
      responseType: "video",
      handler: async (req, res) => {
        const keywords = req.query.keywords as string;

        if (!keywords) {
          return res.status(400).json({
            author: "April Manalo",
            success: false,
            message: "'keywords' parameter is required."
          });
        }

        try {
          const response = await axios.get("https://tikwm.com/api/feed/search", {
            params: { keywords }
          });

          const data = response.data;

          if (
            !data ||
            data.code !== 0 ||
            !data.data ||
            !Array.isArray(data.data.videos) ||
            data.data.videos.length === 0
          ) {
            return res.status(404).json({
              author: "April Manalo",
              success: false,
              message: "No results found."
            });
          }

          const videos = data.data.videos;
          const video = videos[Math.floor(Math.random() * videos.length)];

          return res.json({
            author: "April Manalo",
            success: true,
            title: video.title,
            duration: video.duration,
            cover: video.cover,
            play: video.play,
            video_id: video.video_id
          });
        } catch (error: any) {
          console.error("❌ TikWM error:", error.message);
          return res.status(500).json({
            author: "April Manalo",
            success: false,
            message: "Failed to fetch from TikWM.",
            details: error.response?.data || error.message
          });
        }
      }
    }
  ]
};
