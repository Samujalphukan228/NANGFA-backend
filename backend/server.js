import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import mongoose from "mongoose";
import { setupSocket } from "./src/utils/socket.utils.js";

// Load environment variables
dotenv.config();

// Import env config
import env from "./src/utils/env.js";

// Import routers
import adminRouter from "./src/routers/admin.routes.js";
import employRouter from "./src/routers/employ.routes.js";
import menuRouter from "./src/routers/menu.routes.js";
import orderRouter from "./src/routers/order.routes.js";
import adminEmployRouter from "./src/routers/admin.employ.routes.js";
import adminCallRouter from "./src/routers/adminCall.routes.js";

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Basic routes
app.get("/", (req, res) => {
    res.send("✅ NANGFA Backend API is running!");
});

app.get("/api/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
    });
});

// API Routes
app.use("/api/admin", adminRouter);
app.use("/api/employ", employRouter);
app.use("/api/menu", menuRouter);
app.use("/api/orders", orderRouter);
app.use("/api/admin/employees", adminEmployRouter);
app.use("/api/admin/calls", adminCallRouter);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
        path: req.url,
    });
});

// Error handler
app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
    });
});

// Create HTTP server
const server = http.createServer(app);
const port = process.env.PORT || 5000;

// ✅✅✅ DEBUG LINE - SHOWS WHAT PORT IS BEING USED ✅✅✅
console.log('🔍 PORT DEBUG: process.env.PORT =', process.env.PORT, '| Using port =', port);
// ✅✅✅ END DEBUG ✅✅✅

// Setup Socket.io
const io = setupSocket(server);
app.set("io", io);

console.log("✅ Socket.io configured with authentication and WebRTC support");

// Debug endpoint
app.get("/api/debug/socket-status", (req, res) => {
    const rooms = {};

    io.sockets.adapter.rooms.forEach((sockets, roomName) => {
        if (
            roomName === "kitchen" ||
            roomName === "admin" ||
            roomName.startsWith("role:") ||
            roomName.startsWith("table:")
        ) {
            rooms[roomName] = {
                memberCount: sockets.size,
                members: Array.from(sockets),
            };
        }
    });

    res.json({
        success: true,
        timestamp: new Date().toISOString(),
        connectedSockets: io.sockets.sockets.size,
        rooms,
        features: [
            "WebRTC Audio/Video Calls",
            "Order Notifications",
            "Real-time Updates",
            "Room-based Broadcasting",
        ],
    });
});

// ============================================
// ✅ FIXED: Graceful Shutdown (No more errors)
// ============================================
const shutdown = {
    isShuttingDown: false,

    async start(signal) {
        // Prevent multiple shutdown attempts
        if (this.isShuttingDown) {
            console.log(`⚠️  Shutdown already in progress, ignoring ${signal}`);
            return;
        }
        this.isShuttingDown = true;

        console.log(`🛑 Starting graceful shutdown... (${signal})`);

        // Force exit after 30 seconds
        const forceTimeout = setTimeout(() => {
            console.error("❌ Force shutdown after 30s timeout");
            process.exit(1);
        }, 30000);

        try {
            // 1. Close HTTP server
            if (server.listening) {
                await new Promise((resolve, reject) => {
                    server.close((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                console.log("✅ HTTP server closed");
            }

            // 2. Close Socket.io
            if (io) {
                await new Promise((resolve) => {
                    io.close(() => resolve());
                });
                console.log("✅ Socket.io closed");
            }

            // 3. Close MongoDB (Promise-based for Mongoose 7+)
            if (mongoose.connection.readyState === 1) {
                await mongoose.connection.close();
                console.log("✅ MongoDB connection closed");
            }

            clearTimeout(forceTimeout);
            console.log("👋 Graceful shutdown completed");
            process.exit(0);
        } catch (err) {
            console.error("❌ Shutdown error:", err.message);
            clearTimeout(forceTimeout);
            process.exit(1);
        }
    },
};

// ✅ Use .once() - runs only ONE time per signal
process.once("SIGTERM", () => shutdown.start("SIGTERM"));
process.once("SIGINT", () => shutdown.start("SIGINT"));

// ✅ Error handlers - just exit, don't call shutdown (prevents infinite loop)
process.on("uncaughtException", (error) => {
    console.error("💥 Uncaught Exception:", error);
    process.exit(1);
});

process.on("unhandledRejection", (reason) => {
    // Ignore errors during shutdown
    if (shutdown.isShuttingDown) {
        console.log("⚠️  Ignoring rejection during shutdown");
        return;
    }
    console.error("💥 Unhandled Rejection:", reason);
    process.exit(1);
});

// ============================================
// Connect to MongoDB and start server
// ============================================
mongoose
    .connect(env.mongoURI)
    .then(() => {
        console.log("✅ MongoDB connected successfully");

        server.listen(port, () => {
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`🚀 NANGFA Backend Server Started`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`📡 HTTP Server:    http://localhost:${port}`);
            console.log(`🔌 WebSocket:      ws://localhost:${port}`);
            console.log(`🗄️  Database:       Connected`);
            console.log(`🎯 Features:       Orders, Menu, Calls, Auth`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        });
    })
    .catch((error) => {
        console.error("❌ MongoDB connection error:", error.message);
        process.exit(1);
    });

server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${port} is already in use`);
    } else {
        console.error("❌ Server error:", error);
    }
    process.exit(1);
});
