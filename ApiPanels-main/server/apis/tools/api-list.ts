import type { APIModule } from "../types";
import { apiModules } from "../registry";
import { getAPIList } from "../utils";

export const apiListAPI: APIModule = {
  endpoints: [
    {
      name: "API Documentation",
      category: "Tools",
      description: "Get list of all available APIs with their details",
      path: "/api/list",
      method: "GET",
      handler: (req, res) => {
        const apis = getAPIList(apiModules);
        
        const grouped = apis.reduce((acc, api) => {
          if (!acc[api.category]) {
            acc[api.category] = [];
          }
          acc[api.category].push(api);
          return acc;
        }, {} as Record<string, typeof apis>);
        
        res.json({
          success: true,
          total: apis.length,
          categories: Object.keys(grouped).length,
          apis: grouped,
          author: "April Manalo"
        });
      }
    }
  ]
};
