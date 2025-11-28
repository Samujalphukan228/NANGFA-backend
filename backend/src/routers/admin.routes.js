// src/routers/admin.routes.js
import express from "express";
import { loginAdmin } from "../controllers/admin.controller.js";

const adminRouter = express.Router();

// ✅ Only login route - admin is hardcoded in .env
adminRouter.post("/login", loginAdmin);

export default adminRouter;