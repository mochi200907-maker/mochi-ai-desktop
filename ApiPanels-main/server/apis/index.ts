import type { Express } from "express";
import { getAPIList } from "./utils";
import { apiModules } from "./registry";
import { apiListAPI } from "./tools/api-list";

/**
 * Auto-register all API endpoints from the modules
 * This function iterates through all API modules and registers their endpoints
 */
export function registerAPIs(app: Express): void {
  let totalEndpoints = 0;
  const categoryCounts: Record<string, number> = {};

  // Register all APIs from registry
  apiModules.forEach(module => {
    module.endpoints.forEach(endpoint => {
      // Register the endpoint based on HTTP method
      switch (endpoint.method) {
        case "GET":
          app.get(endpoint.path, endpoint.handler);
          break;
        case "POST":
          app.post(endpoint.path, endpoint.handler);
          break;
        case "PUT":
          app.put(endpoint.path, endpoint.handler);
          break;
        case "DELETE":
          app.delete(endpoint.path, endpoint.handler);
          break;
      }

      // Track stats
      totalEndpoints++;
      categoryCounts[endpoint.category] = (categoryCounts[endpoint.category] || 0) + 1;

      console.log(`✅ Registered [${endpoint.category}] ${endpoint.method} ${endpoint.path} - ${endpoint.name}`);
    });
  });

  // Register API list endpoint separately to avoid circular dependency
  apiListAPI.endpoints.forEach(endpoint => {
    app.get(endpoint.path, endpoint.handler);
    totalEndpoints++;
    categoryCounts[endpoint.category] = (categoryCounts[endpoint.category] || 0) + 1;
    console.log(`✅ Registered [${endpoint.category}] ${endpoint.method} ${endpoint.path} - ${endpoint.name}`);
  });

  console.log(`\n🚀 Total APIs registered: ${totalEndpoints}`);
  console.log("📊 APIs by category:", categoryCounts);
}

/**
 * Get all registered API endpoints with their metadata
 * Useful for creating API documentation or listings
 */
export function getAllAPIs() {
  return getAPIList(apiModules);
}

/**
 * Re-export apiModules for backward compatibility
 */
export { apiModules };
