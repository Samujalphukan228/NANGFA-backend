import express from "express";
import rateLimit from "express-rate-limit";
import {
  getAllEmployees,
  approveEmployee,
  toggleWaiterActive,
  deleteEmployee,
} from "../controllers/admin.employ.controller.js";
import { verifyAdmin } from "../middlewares/verifyAdmin.middleware.js";

const adminEmployRouter = express.Router();

const deleteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: "Too many delete requests" },
});

adminEmployRouter.get("/all", verifyAdmin, getAllEmployees);
adminEmployRouter.put("/:id/approve", verifyAdmin, approveEmployee);
adminEmployRouter.put("/:id/toggle-active", verifyAdmin, toggleWaiterActive); // ← NEW
adminEmployRouter.delete("/:id", verifyAdmin, deleteLimiter, deleteEmployee);

export default adminEmployRouter;