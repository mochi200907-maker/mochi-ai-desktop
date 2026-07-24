import type { APIModule } from "./types";

/**
 * Get all registered API endpoints with their metadata
 * Useful for creating API documentation or listings
 */
export function getAPIList(modules: APIModule[]) {
  const apis = modules.flatMap(module => 
    module.endpoints.map((endpoint, index) => ({
      id: endpoint.path.replace(/^\/api\//, '').replace(/\//g, '-').toLowerCase() + `-${index}`,
      name: endpoint.name,
      category: endpoint.category,
      description: endpoint.description || "No description",
      endpoint: endpoint.path,
      path: endpoint.path,
      method: endpoint.method,
      parameters: endpoint.parameters || [],
      exampleValues: endpoint.exampleValues || {},
      responseType: endpoint.responseType || "json",
    }))
  );

  return apis;
}
