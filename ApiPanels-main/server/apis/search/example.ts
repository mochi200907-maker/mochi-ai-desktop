import type { APIModule } from "../types";

export const exampleSearchAPI: APIModule = {
  endpoints: [
    {
      name: "Example Search",
      category: "Search",
      description: "Example search API to demonstrate automatic loading",
      path: "/api/search/example",
      method: "GET",
      parameters: [
        { name: "query", type: "text", required: true, description: "Search query", placeholder: "test query" },
      ],
      exampleValues: {
        query: "example search"
      },
      responseType: "json",
      handler: async (req, res) => {
        const query = req.query.query as string;
        
        if (!query) {
          return res.status(400).json({
            success: false,
            message: "Missing 'query' parameter",
            author: "April Manalo"
          });
        }
        
        res.json({
          success: true,
          query,
          results: [
            { id: 1, title: "Example Result 1", description: "This is an example result" },
            { id: 2, title: "Example Result 2", description: "Another example result" },
          ],
          author: "April Manalo"
        });
      }
    }
  ]
};
