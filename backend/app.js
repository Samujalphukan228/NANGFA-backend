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

app.use(cors());
app.use(express.json());

app.use("/api/admin", adminRouter);
app.use("/api/employ", employRouter);
app.use("/api/menu", menuRouter);
app.use("/api/orders", orderRouter);
app.use("/api/admin/employees", adminEmployRouter)
app.use("/api/admin/calls", adminCallRouter);


export default app;