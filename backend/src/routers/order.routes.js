import express from "express";
import rateLimit from "express-rate-limit";
import {createOrder,updateOrder, completeOrder,getCurrentOrders,getOrderById,deleteOrder,getTodayRevenue,getTotalRevenue,getRevenueByDateRange,} from "../controllers/order.controller.js";
import { verifyAdmin } from "../middlewares/verifyAdmin.middleware.js";
import { verifyAdminOrKitchen } from "../middlewares/verifyAdminOrKitchen.middleware.js";

const orderRouter = express.Router();

const createOrderLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { success: false, message: "Too many orders" },
});

const updateOrderLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { success: false, message: "Too many update requests" },
});

// Revenue routes
orderRouter.get("/revenue/today", verifyAdmin, getTodayRevenue);
orderRouter.get("/revenue/total", verifyAdmin, getTotalRevenue);
orderRouter.get("/revenue/range", verifyAdmin, getRevenueByDateRange);
orderRouter.get("/current", verifyAdminOrKitchen, getCurrentOrders);
orderRouter.post("/create", verifyAdmin, createOrderLimiter, createOrder);
orderRouter.put("/:id", verifyAdmin, updateOrderLimiter, updateOrder);
orderRouter.put("/:id/complete", verifyAdmin, completeOrder);
orderRouter.delete("/:id", verifyAdmin, deleteOrder);
orderRouter.get("/:id", verifyAdminOrKitchen, getOrderById);

export default orderRouter;