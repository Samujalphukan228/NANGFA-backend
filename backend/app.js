// // app.js - Remove await connectDB()
// import express from "express";
// import dotenv from "dotenv";
// import cors from "cors";
// // import { connectDB } from "./src/configs/DataBase.js";  // Remove this
// import adminRouter from "./src/routers/admin.routes.js";
// import employRouter from "./src/routers/employ.routes.js";
// import menuRouter from "./src/routers/menu.routes.js";
// import orderRouter from "./src/routers/order.routes.js";
// import adminEmployRouter from "./src/routers/admin.employ.routes.js";
// import adminCallRouter from "./src/routers/adminCall.routes.js";

// dotenv.config();

// const app = express();

// // ❌ REMOVE THIS LINE
// // await connectDB();

// const allowedOrigins = [
//     process.env.FRONTEND_URL_1,
//     process.env.FRONTEND_URL_2,
// ].filter(Boolean);

// app.use(cors());
// app.use(express.json());

// app.use((req, res, next) => {
//     console.log(`${req.method} ${req.url}`);
//     next();
// });

// app.get("/", (req, res) => {
//     res.send("✅ NANGFA Backend API is running!");
// });

// app.get("/api/health", (req, res) => {
//     res.status(200).json({
//         status: "ok",
//         timestamp: new Date().toISOString(),
//     });
// });

// app.use("/api/admin", adminRouter);
// app.use("/api/employ", employRouter);
// app.use("/api/menu", menuRouter);
// app.use("/api/orders", orderRouter);
// app.use("/api/admin/employees", adminEmployRouter);
// app.use("/api/admin/calls", adminCallRouter);

// app.use((req, res) => {
//     res.status(404).json({
//         success: false,
//         message: "Route not found",
//         path: req.url,
//     });
// });

// app.use((err, req, res, next) => {
//     res.status(err.statusCode || 500).json({
//         success: false,
//         message: err.message,
//     });
// });

// export default app;