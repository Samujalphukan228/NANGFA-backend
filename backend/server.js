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
const port = process.env.port || 5000;

// ✅ Setup Socket.io using your existing socket.utils.js
const io = setupSocket(server);
app.set("io", io);

console.log("✅ Socket.io configured with authentication and WebRTC support");

// ✅ Optional: Add debug endpoint to check active rooms and connections
app.get("/api/debug/socket-status", (req, res) => {
    const rooms = {};
    
    io.sockets.adapter.rooms.forEach((sockets, roomName) => {
        // Filter relevant rooms
        if (roomName === 'kitchen' || 
            roomName === 'admin' || 
            roomName.startsWith('role:') || 
            roomName.startsWith('table:')) {
            rooms[roomName] = {
                memberCount: sockets.size,
                members: Array.from(sockets)
            };
        }
    });
    
    res.json({
        success: true,
        timestamp: new Date().toISOString(),
        connectedSockets: io.sockets.sockets.size,
        rooms,
        features: [
            'WebRTC Audio/Video Calls',
            'Order Notifications',
            'Real-time Updates',
            'Room-based Broadcasting'
        ]
    });
});

// ✅ FIXED: Graceful shutdown with async/await (Mongoose 7+ compatible)
let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
    // Prevent multiple shutdown attempts (fixes infinite loop)
    if (isShuttingDown) {
        console.log('⏳ Shutdown already in progress...');
        return;
    }
    isShuttingDown = true;
    
    console.log(`🛑 Starting graceful shutdown... (${signal})`);

    // Force shutdown after 30 seconds
    const forceTimeout = setTimeout(() => {
        console.error('❌ Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 30000);

    try {
        // 1. Close HTTP server
        await new Promise((resolve, reject) => {
            server.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('✅ HTTP server closed');

        // 2. Close Socket.io
        await new Promise((resolve) => {
            io.close(() => resolve());
        });
        console.log('✅ Socket.io closed');

        // 3. Close MongoDB connection (Promise-based - NO callback for Mongoose 7+)
        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed');

        clearTimeout(forceTimeout);
        console.log('👋 Graceful shutdown completed');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error during shutdown:', err);
        clearTimeout(forceTimeout);
        process.exit(1);
    }
};

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (error) => {
    console.error('💥 Unhandled Rejection:', error);
    gracefulShutdown('unhandledRejection');
});

// Connect to MongoDB and start server
mongoose.connect(env.mongoURI)
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

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use`);
    } else {
        console.error('❌ Server error:', error);
    }
    process.exit(1);
});
