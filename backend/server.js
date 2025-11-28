// // server.js - Add connectDB here
// import http from "http";
// import env from "./src/utils/env.js";
// import app from "./app.js";
// import { setupSocket } from "./src/utils/socket.utils.js";
// import { connectDB } from "./src/configs/DataBase.js";  // ✅ Add this

// const server = http.createServer(app);
// const port = env.port;

// const io = setupSocket(server);
// app.set("io", io);

// // Graceful shutdown
// const gracefulShutdown = () => {
//     server.close(() => {
//         io.close(() => {
//             process.exit(0);
//         });
//     });

//     setTimeout(() => {
//         process.exit(1);
//     }, 30000);
// };

// // Handle process signals
// process.on('SIGTERM', gracefulShutdown);
// process.on('SIGINT', gracefulShutdown);
// process.on('uncaughtException', (error) => {
//     console.error('💥 Uncaught Exception:', error);
//     gracefulShutdown();
// });
// process.on('unhandledRejection', (error) => {
//     console.error('💥 Unhandled Rejection:', error);
//     gracefulShutdown();
// });

// // ✅ Connect to DB first, then start server
// connectDB()
//     .then(() => {
//         server.listen(port, () => {
//             console.log(`🚀 Server is running at port ${port}`);
//             console.log(`🔌 Socket.io is ready`);
//         });
//     })
//     .catch((error) => {
//         console.error("❌ Failed to connect to database:", error);
//         process.exit(1);
//     });

// server.on('error', (error) => {
//     if (error.code === 'EADDRINUSE') {
//         console.error(`❌ Port ${port} is already in use`);
//     } else {
//         console.error('❌ Server error:', error);
//     }
//     process.exit(1);
// });










// server.js - EVERYTHING IN ONE FILE
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";

// Load environment variables
dotenv.config();

// Import env config
import env from "./src/utils/env.js";

// Import routers (comment these out if they cause issues)
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
const port = env.port || 5000;

// Setup Socket.io
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
    }
});

io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);
    
    socket.on("disconnect", () => {
        console.log("🔌 Client disconnected:", socket.id);
    });
});

app.set("io", io);

// Graceful shutdown
const gracefulShutdown = () => {
    server.close(() => {
        io.close(() => {
            process.exit(0);
        });
    });

    setTimeout(() => {
        process.exit(1);
    }, 30000);
};

// Handle process signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    gracefulShutdown();
});
process.on('unhandledRejection', (error) => {
    console.error('💥 Unhandled Rejection:', error);
    gracefulShutdown();
});

// Connect to MongoDB and start server
mongoose.connect(env.mongoURI)
    .then(() => {
        console.log("✅ MongoDB connected successfully");
        
        server.listen(port, () => {
            console.log(`🚀 Server is running at port ${port}`);
            console.log(`🔌 Socket.io is ready`);
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