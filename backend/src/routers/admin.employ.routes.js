import express from "express";
import rateLimit from "express-rate-limit";
import {getAllEmployees,approveEmployee,deleteEmployee,} from "../controllers/admin.employ.controller.js";
import { verifyAdmin } from "../middlewares/verifyAdmin.middleware.js";

const adminEmployRouter = express.Router();

const deleteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: "Too many delete requests" },
});

// Get all employees
adminEmployRouter.get("/all", verifyAdmin, getAllEmployees);

// Approve employee
adminEmployRouter.put("/:id/approve", verifyAdmin, approveEmployee);

// Delete employee
adminEmployRouter.delete("/:id", verifyAdmin, deleteLimiter, deleteEmployee);

export default adminEmployRouter;