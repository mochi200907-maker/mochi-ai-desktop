# Norch REST API Panel

## Overview

Norch REST API Panel is a modern, interactive web application for testing and exploring REST API endpoints. Built with React, TypeScript, and Express, it provides a beautiful interface for developers to test various API services including AI models (ChatGPT-5, Gemini), search services (Wikipedia, Spotify), and media downloaders (TikTok, Spotify). The application features a dark-themed UI with purple/pink gradients, real-time response visualization, syntax highlighting, and automatic media preview capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript, using Vite as the build tool and development server.

**Routing**: Client-side routing implemented with Wouter, providing lightweight navigation without full page reloads. Routes include a home dashboard (`/`), individual API detail pages (`/api/:id`), and a 404 fallback.

**State Management**: React Query (@tanstack/react-query) handles server state, API calls, and caching. Local component state managed with React hooks (useState, useEffect).

**UI Component System**: Built on Radix UI primitives with custom styling via Tailwind CSS. Components follow the shadcn/ui architecture pattern with a "New York" style variant. All UI components are located in `client/src/components/ui/` and include accessible, customizable primitives for buttons, cards, forms, dialogs, and more.

**Design System**: Dark theme with purple (#8b5cf6) to pink (#ec4899) gradient accents. Typography uses Inter for UI text and JetBrains Mono for code blocks. The design follows a sidebar + main content layout with responsive breakpoints at 768px (tablet) and 1024px (desktop).

**Styling Approach**: Utility-first CSS with Tailwind, using CSS custom properties for theming. Color tokens defined in `client/src/index.css` with HSL values for easy manipulation. Special hover/active states using elevation classes (`hover-elevate`, `active-elevate-2`).

### Backend Architecture

**Server Framework**: Express.js running on Node.js with TypeScript compilation via tsx for development and esbuild for production builds.

**API Proxy Pattern**: The server implements a unified proxy endpoint (`/api/proxy`) that forwards requests to external API services. This design decouples the frontend from direct API calls and provides a single point for error handling, logging, and response transformation.

**Request Flow**: Client makes request to `/api/proxy?endpoint={url}&{params}` → Server forwards to external API → Server transforms response → Client receives standardized response format with `data`, `status`, `responseTime`, and `headers`.

**Response Enhancement**: Automatically injects author attribution ("April Manalo") into JSON responses if not already present.

**Development Setup**: Vite middleware integration for HMR (Hot Module Replacement) during development. Production builds serve static files from `dist/public`.

**Logging**: Custom request/response logging with timestamps and truncated output for API routes. Captures method, path, status code, duration, and response preview.

### Data Storage

**Database**: PostgreSQL via Neon serverless driver configured in `drizzle.config.ts`. Connection string expected in `DATABASE_URL` environment variable.

**ORM**: Drizzle ORM for type-safe database operations. Schema defined in `shared/schema.ts` with a basic users table (id, username, password).

**Current Usage**: Database infrastructure is configured but minimally utilized. The application currently uses in-memory storage (`MemStorage` class in `server/storage.ts`) for user data, suggesting potential for future user authentication features.

**Migration Strategy**: Drizzle Kit handles schema migrations with output to `./migrations` directory. Push to database via `npm run db:push` script.

### External Dependencies

**Third-Party APIs**: The application proxies requests to multiple external services:
- ChatGPT-5 (Groq API with compound model)
- Gemini 2.5-Flash (Google Generative AI)
- Sim AI (Llama 3.3 via Groq)
- Text-to-Video generation
- Wikipedia search and images
- Spotify search and download
- TikTok media download

**API Configuration**: External API endpoints configured in `shared/api-schema.ts` with `API_BASE_URL` variable. Each endpoint definition includes category, parameters, example values, and response type metadata.

**HTTP Client**: Axios for making external API requests with 30-second timeout and custom status validation.

**UI Libraries**: 
- Radix UI for accessible component primitives
- Lucide React for icons
- date-fns for date manipulation
- cmdk for command palette functionality

**Development Tools**:
- Replit-specific plugins for error overlay, cartographer, and dev banner
- TypeScript for type safety across client/server/shared code
- PostCSS with Autoprefixer for CSS processing

**Authentication Ready**: Infrastructure suggests planned authentication features (session management with connect-pg-simple, user schema, storage interfaces) but not currently implemented in the UI.