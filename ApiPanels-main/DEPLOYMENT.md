# Deployment Guide - Render

## Prerequisites
- Neon PostgreSQL database URL
- Render account

## Environment Variables
Set these in Render dashboard:
```
DATABASE_URL=<your-neon-database-url>
NODE_ENV=production
```

**Note**: Do NOT set PORT manually. Render automatically assigns a port and the server will bind to it via `process.env.PORT`.

## Render Configuration

### Build Command
```bash
npm install && npm run build
```

### Start Command
```bash
npm run start
```

### Settings
- **Environment**: Node
- **Node Version**: 20.x
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run start`

## Build Process
The build command does the following:
1. `vite build` - Builds the React frontend to `dist/public`
2. `esbuild server/index.ts` - Bundles the Express backend to `dist/index.js`

## Production Server
- The Express server serves both API routes and static frontend files
- In production, static files are served from `dist/public`
- All frontend routes fall back to `index.html` for client-side routing

## Database Setup
1. Create a Neon PostgreSQL database
2. Copy the connection string
3. Add it to Render environment variables as `DATABASE_URL`
4. Run migrations if needed using: `npm run db:push`

## Deployment Steps
1. Push your code to GitHub
2. Create a new Web Service on Render
3. Connect your GitHub repository
4. Set the build and start commands above
5. Add environment variables
6. Deploy!

## Troubleshooting

### Build Fails
- Ensure all dependencies are in `dependencies`, not `devDependencies`
- Check that TypeScript compiles without errors: `npm run check`

### 404 on Frontend Routes
- The server is configured to serve `index.html` for all non-API routes
- Check that `dist/public` contains the built files

### Database Connection Issues
- Verify `DATABASE_URL` is set correctly
- Check Neon database is accessible from Render IPs
