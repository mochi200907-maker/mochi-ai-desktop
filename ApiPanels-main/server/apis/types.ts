import type { Express, Request, Response } from "express";

export type APICategory = 
  | "AI" 
  | "Tools" 
  | "Video" 
  | "Random" 
  | "Canvas" 
  | "Educational" 
  | "Entertainment"
  | "Search"
  | "Downloader";

export interface APIParameter {
  name: string;
  type: "text" | "url" | "number";
  required: boolean;
  description: string;
  placeholder?: string;
}

export interface APIEndpoint {
  name: string;
  category: APICategory;
  description?: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  handler: (req: Request, res: Response) => Promise<any> | any;
  parameters?: APIParameter[];
  exampleValues?: Record<string, string>;
  responseType?: "json" | "image" | "video" | "audio";
}

export interface APIModule {
  endpoints: APIEndpoint[];
}
