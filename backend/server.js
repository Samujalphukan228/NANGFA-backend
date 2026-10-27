import express from "express";
import cors from "cors";
import http from "http";
import mongoose from "mongoose";
import { setupSocket } from "./src/utils/socket.utils.js";
import env from "./src/utils/env.js";

import adminRouter from "./src/routers/admin.routes.js";
import employRouter from "./src/routers/employ.routes.js";
import menuRouter from "./src/routers/menu.routes.js";
import orderRouter from "./src/routers/order.routes.js";
import adminEmployRouter from "./src/routers/admin.employ.routes.js";
import adminCallRouter from "./src/routers/adminCall.routes.js";
import waiterRouter from "./src/routers/waiter.routes.js";
import financeRouter from "./src/routers/finance.routes.js";

const app = express();

// Auth uses the Authorization header (bearer token), not cookies, so
// credentials are not needed. This keeps `origin: "*"` valid per the CORS spec.
app.use(cors({
    origin: "*",
    credentials: false,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

app.use((req, res, next) => {
    if (process.env.NODE_ENV !== "production") {
        console.log(`${req.method} ${req.url}`);
    }
    next();
});

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
app.use("/api/waiter", waiterRouter);
app.use("/api/finance", financeRouter);

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

const server = http.createServer(app);
const port = process.env.PORT || 5000;

// Setup Socket.io
const io = setupSocket(server);
app.set("io", io);

console.log("✅ Socket.io configured");

const shutdown = {
    isShuttingDown: false,

    async start(signal) {
        if (this.isShuttingDown) {
            console.log(`⚠️ Shutdown already in progress`);
            return;
        }
        this.isShuttingDown = true;
        console.log(`🛑 Starting graceful shutdown... (${signal})`);

        const forceTimeout = setTimeout(() => {
            console.error("❌ Force shutdown after 30s timeout");
            process.exit(1);
        }, 30000);

        try {
            if (server.listening) {
                await new Promise((resolve, reject) => {
                    server.close((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                console.log("✅ HTTP server closed");
            }

            if (io) {
                await new Promise((resolve) => {
                    io.close(() => resolve());
                });
                console.log("✅ Socket.io closed");
            }

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

process.once("SIGTERM", () => shutdown.start("SIGTERM"));
process.once("SIGINT", () => shutdown.start("SIGINT"));

process.on("uncaughtException", (error) => {
    console.error("💥 Uncaught Exception:", error);
    process.exit(1);
});

process.on("unhandledRejection", (reason) => {
    if (shutdown.isShuttingDown) {
        console.log("⚠️ Ignoring rejection during shutdown");
        return;
    }
    console.error("💥 Unhandled Rejection:", reason);
    process.exit(1);
});

mongoose
    .connect(env.mongoURI)
    .then(() => {
        console.log("✅ MongoDB connected successfully");

        server.listen(port, '0.0.0.0', () => {
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`🚀 NANGFA Backend Server Started`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`📡 Listening on:   0.0.0.0:${port}`);
            console.log(`🗄️  Database:       Connected`);
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