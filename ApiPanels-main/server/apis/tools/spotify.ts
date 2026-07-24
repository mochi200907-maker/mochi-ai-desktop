import axios from "axios";
import type { APIModule } from "../types";

// SECURITY WARNING: Use environment variables for API credentials
// Set these in your deployment platform:
//   SPOTIFY_CLIENT_ID=your_client_id
//   SPOTIFY_CLIENT_SECRET=your_client_secret
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";

let spotifyToken: { token: string, expires: number } | null = null;

async function getSpotifyToken() {
  if (spotifyToken && Date.now() < spotifyToken.expires) {
    return spotifyToken.token;
  }

  const authString = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  
  const response = await axios.post('https://accounts.spotify.com/api/token', 
    'grant_type=client_credentials',
    {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  spotifyToken = {
    token: response.data.access_token,
    expires: Date.now() + (response.data.expires_in * 1000) - 60000
  };

  return spotifyToken.token;
}

export const spotifyAPI: APIModule = {
  endpoints: [
    {
      name: "Spotify",
      category: "Search",
      description: "Search for songs, artists, and albums on Spotify",
      path: "/api/spotify",
      method: "GET",
      parameters: [
        { name: "q", type: "text", required: true, description: "Search query", placeholder: "Bohemian Rhapsody" },
      ],
      exampleValues: {
        q: "Imagine Dragons"
      },
      responseType: "json",
      handler: async (req, res) => {
        const query = req.query.q as string;

        if (!query) {
          return res.status(400).json({
            status: "error",
            message: "Missing 'q' parameter",
            author: "April Manalo"
          });
        }

        try {
          const token = await getSpotifyToken();
          
          const { data } = await axios.get(`https://api.spotify.com/v1/search`, {
            params: {
              q: query,
              type: 'track',
              limit: 10
            },
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          const tracks = data.tracks.items.map((track: any) => ({
            id: track.id,
            title: track.name,
            artist: track.artists.map((a: any) => a.name).join(", "),
            album: track.album.name,
            duration: `${Math.floor(track.duration_ms / 60000)}:${String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, '0')}`,
            preview_url: track.preview_url,
            spotify_url: track.external_urls.spotify,
            cover: track.album.images[0]?.url,
          }));

          res.json({
            status: "success",
            query,
            count: tracks.length,
            results: tracks,
            author: "April Manalo"
          });
        } catch (error: any) {
          console.error("Error searching Spotify:", error.message);
          res.status(500).json({
            status: "error",
            message: "Failed to search Spotify",
            details: error.response?.data || error.message,
            author: "April Manalo"
          });
        }
      }
    },
    {
      name: "Spotify Downloader",
      category: "Downloader",
      description: "Download songs from Spotify with metadata and cover art",
      path: "/api/spotidl",
      method: "GET",
      parameters: [
        { name: "url", type: "url", required: true, description: "Spotify track URL", placeholder: "https://open.spotify.com/track/..." },
      ],
      exampleValues: {
        url: "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp"
      },
      responseType: "audio",
      handler: async (req, res) => {
        const spotifyUrl = req.query.url as string;

        if (!spotifyUrl) {
          return res.status(400).json({
            status: "error",
            message: "Missing 'url' parameter",
            author: "April Manalo"
          });
        }

        try {
          const apiUrl = `https://api.nekolabs.web.id/downloader/spotify/v1?url=${encodeURIComponent(spotifyUrl)}`;
          const { data } = await axios.get(apiUrl);

          if (!data?.success || !data?.result) {
            return res.status(404).json({
              status: "error",
              message: "Unable to fetch song details from NekoLabs API",
              author: "April Manalo"
            });
          }

          const song = data.result;
          const filename = `${song.title || "song"}.mp3`;

          const downloadUrl = `${req.protocol}://${req.get("host")}/api/download?url=${encodeURIComponent(song.downloadUrl)}&filename=${encodeURIComponent(filename)}`;

          res.json({
            author: "April Manalo",
            status: "success",
            title: song.title,
            artist: song.artist,
            duration: song.duration,
            cover: song.cover,
            download_url: downloadUrl,
          });
        } catch (error: any) {
          console.error("Error fetching song:", error.message);
          res.status(500).json({
            status: "error",
            message: "Failed to fetch song details",
            details: error.response?.data || error.message,
            author: "April Manalo"
          });
        }
      }
    },
    {
      name: "File Download Proxy",
      category: "Tools",
      description: "Proxy for downloading files",
      path: "/api/download",
      method: "GET",
      handler: async (req, res) => {
        const fileUrl = req.query.url as string;
        const filename = (req.query.filename as string) || "song.mp3";

        if (!fileUrl) {
          return res.status(400).json({
            status: "error",
            message: "Missing 'url' parameter",
            author: "April Manalo"
          });
        }

        try {
          const response = await axios.get(fileUrl, { responseType: "stream" });
          res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
          res.setHeader("Content-Type", "audio/mpeg");
          response.data.pipe(res);
        } catch (error: any) {
          console.error("Error downloading file:", error.message);
          res.status(500).json({
            status: "error",
            message: "Failed to download file",
            author: "April Manalo"
          });
        }
      }
    }
  ]
};
