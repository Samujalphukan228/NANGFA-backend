import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./src/configs/DataBase.js";
import adminRouter from "./src/routers/admin.routes.js";
import employRouter from "./src/routers/employ.routes.js";
import { connectCloudinary } from "./src/configs/Cloudinary.js";
import menuRouter from "./src/routers/menu.routes.js";
import orderRouter from "./src/routers/order.routes.js";
import adminEmployRouter from "./src/routers/admin.employ.routes.js";
import adminCallRouter from "./src/routers/adminCall.routes.js";

dotenv.config();

const app = express();

await connectDB();
await connectCloudinary();

// ✅ CORS Setup
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body Parser
app.use(express.json());

// 🔍 LOG EVERY REQUEST
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.url}`);
    next();
});

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
    });
});

// Routes
app.use("/api/admin", adminRouter);
app.use("/api/employ", employRouter);
app.use("/api/menu", menuRouter);
app.use("/api/orders", orderRouter);
app.use("/api/admin/employees", adminEmployRouter);
app.use("/api/admin/calls", adminCallRouter);

// 404 Handler
app.use((req, res, next) => {
    console.log('❌ 404 Not Found:', req.url);
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.url
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('🔥 ERROR CAUGHT:', err.message);
    console.error('Stack:', err.stack);
    console.error('URL:', req.url);
    
    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
        stack: err.stack
    });
});

export default app;