import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { db } from "./db";
import { notifications as notificationsTable } from "../shared/schema";
import { desc, eq } from "drizzle-orm";
import { registerAPIs } from "./apis";

// WebSocket clients for real-time notifications
const notificationClients = new Set<WebSocket>();

function broadcastNotification(notification: any) {
  const message = JSON.stringify({ type: 'new_notification', data: notification });
  notificationClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Register all modular APIs
  console.log("\n🔌 Registering modular APIs...");
  registerAPIs(app);
  
  // ==================== API PROXY ====================
  app.get("/api/proxy", async (req, res) => {
    const { endpoint, ...params } = req.query;
    
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ 
        error: "Missing 'endpoint' parameter",
        author: "April Manalo"
      });
    }
    
    try {
      const startTime = Date.now();
      
      const url = new URL(endpoint, `http://localhost:${process.env.PORT || 5000}`);
      Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.append(key, String(value));
      });
      
      const response = await fetch(url.toString());
      const responseTime = Date.now() - startTime;
      const contentType = response.headers.get('content-type') || '';
      
      let data;
      try {
        if (contentType.includes('application/json')) {
          data = await response.json();
        } else {
          const text = await response.text();
          try {
            data = JSON.parse(text);
          } catch {
            data = { result: text, type: 'text' };
          }
        }
      } catch (parseError) {
        data = { 
          error: 'Failed to parse response',
          contentType,
          note: 'Response may be binary or non-JSON. Check the endpoint directly for binary content.'
        };
      }
      
      res.json({
        data,
        status: response.status,
        responseTime,
        contentType
      });
    } catch (error: any) {
      console.error(`Proxy error for ${endpoint}:`, error.message);
      res.status(500).json({ 
        error: error.message || "Failed to execute API call",
        author: "April Manalo"
      });
    }
  });
  
  // ==================== NOTIFICATION SYSTEM ====================
  // These routes handle the notification system
  
  // Private notification endpoint (owner only)
  app.post("/api/norch/notification", async (req, res) => {
    // Default secret - for production, set NOTIFICATION_SECRET environment variable
    const NOTIFICATION_SECRET = process.env.NOTIFICATION_SECRET || "norchteam2009";
    
    // Get secret from Authorization header or request body
    const authHeader = req.headers.authorization;
    const secret = authHeader?.replace('Bearer ', '') || req.body.secret;
    
    // Constant-time comparison to prevent timing attacks
    if (!secret || secret.length !== NOTIFICATION_SECRET.length) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
        author: "April Manalo"
      });
    }
    
    let isValid = true;
    for (let i = 0; i < NOTIFICATION_SECRET.length; i++) {
      if (secret[i] !== NOTIFICATION_SECRET[i]) {
        isValid = false;
      }
    }
    
    if (!isValid) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
        author: "April Manalo"
      });
    }
    
    const message = req.body.message || req.query.message;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Missing 'message' parameter",
        author: "April Manalo"
      });
    }
    
    try {
      const [notification] = await db.insert(notificationsTable).values({
        message: message as string,
        timestamp: Date.now(),
        read: false,
        source: "developer"
      }).returning();
      
      console.log("📢 New notification added from developer");
      
      // Broadcast to all connected WebSocket clients
      broadcastNotification(notification);
      
      res.json({
        success: true,
        message: "Notification added successfully",
        notification,
        author: "April Manalo"
      });
    } catch (error: any) {
      console.error("Error adding notification");
      res.status(500).json({
        success: false,
        message: "Failed to add notification",
        author: "April Manalo"
      });
    }
  });
  
  // Get all notifications (public)
  app.get("/api/notifications", async (req, res) => {
    try {
      const allNotifications = await db.select()
        .from(notificationsTable)
        .orderBy(desc(notificationsTable.timestamp))
        .limit(50);
      
      // Ensure allNotifications is an array
      const notifications = Array.isArray(allNotifications) ? allNotifications : [];
      const unreadCount = notifications.filter(n => n && !n.read).length;
      
      res.json({
        success: true,
        notifications,
        unreadCount,
        author: "April Manalo"
      });
    } catch (error: any) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch notifications",
        author: "April Manalo"
      });
    }
  });
  
  // Mark notification as read
  app.post("/api/notifications/:id/read", async (req, res) => {
    const { id } = req.params;
    
    try {
      const [updated] = await db.update(notificationsTable)
        .set({ read: true })
        .where(eq(notificationsTable.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Notification not found",
          author: "April Manalo"
        });
      }
      
      res.json({
        success: true,
        message: "Notification marked as read",
        author: "April Manalo"
      });
    } catch (error: any) {
      console.error("Error marking notification as read:", error.message);
      res.status(500).json({
        success: false,
        message: "Failed to mark notification as read",
        author: "April Manalo"
      });
    }
  });
  
  // Mark all notifications as read
  app.post("/api/notifications/read-all", async (req, res) => {
    try {
      await db.update(notificationsTable)
        .set({ read: true })
        .where(eq(notificationsTable.read, false));
      
      res.json({
        success: true,
        message: "All notifications marked as read",
        author: "April Manalo"
      });
    } catch (error: any) {
      console.error("Error marking all notifications as read:", error.message);
      res.status(500).json({
        success: false,
        message: "Failed to mark all notifications as read",
        author: "April Manalo"
      });
    }
  });

  // Delete a single notification
  app.delete("/api/notifications/:id", async (req, res) => {
    const { id } = req.params;
    
    try {
      const [deleted] = await db.delete(notificationsTable)
        .where(eq(notificationsTable.id, id))
        .returning();
      
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Notification not found",
          author: "April Manalo"
        });
      }
      
      res.json({
        success: true,
        message: "Notification deleted",
        author: "April Manalo"
      });
    } catch (error: any) {
      console.error("Error deleting notification:", error.message);
      res.status(500).json({
        success: false,
        message: "Failed to delete notification",
        author: "April Manalo"
      });
    }
  });

  // Clear all notifications
  app.delete("/api/notifications", async (req, res) => {
    try {
      await db.delete(notificationsTable);
      
      res.json({
        success: true,
        message: "All notifications cleared",
        author: "April Manalo"
      });
    } catch (error: any) {
      console.error("Error clearing notifications:", error.message);
      res.status(500).json({
        success: false,
        message: "Failed to clear notifications",
        author: "April Manalo"
      });
    }
  });

  // ==================== WEBSOCKET SETUP ====================
  
  const httpServer = createServer(app);
  
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws'
  });
  
  wss.on('connection', (ws: WebSocket) => {
    console.log('📡 New WebSocket client connected');
    notificationClients.add(ws);
    
    ws.on('close', () => {
      console.log('📡 WebSocket client disconnected');
      notificationClients.delete(ws);
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      notificationClients.delete(ws);
    });
  });

  return httpServer;
}
