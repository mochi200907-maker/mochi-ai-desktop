import { useQuery } from "@tanstack/react-query";
import type { APIEndpoint } from "@shared/api-schema";

interface APIListResponse {
  success: boolean;
  total: number;
  categories: number;
  apis: Record<string, any[]>;
}

export function useAPIEndpoints() {
  const { data, isLoading, error } = useQuery<APIEndpoint[]>({
    queryKey: ["api-endpoints"],
    queryFn: async () => {
      const response = await fetch("/api/list");
      if (!response.ok) {
        throw new Error("Failed to fetch API list");
      }
      const result: APIListResponse = await response.json();
      
      const flatEndpoints: APIEndpoint[] = [];
      Object.values(result.apis).forEach(categoryApis => {
        categoryApis.forEach(api => {
          flatEndpoints.push({
            id: api.id || api.path.replace(/^\/api\//, '').replace(/\//g, '-').toLowerCase(),
            name: api.name,
            category: api.category,
            endpoint: api.endpoint || api.path,
            description: api.description || "No description",
            parameters: api.parameters || [],
            exampleValues: api.exampleValues || {},
            responseType: api.responseType || "json",
          });
        });
      });
      
      return flatEndpoints;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    endpoints: data || [],
    isLoading,
    error,
  };
}
