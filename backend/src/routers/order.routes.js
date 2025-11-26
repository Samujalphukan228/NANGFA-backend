import express from "express";
import rateLimit from "express-rate-limit";
import {
  createOrder,
  updateOrder,
  completeOrder,
  cancelOrder,
  getCurrentOrders,
  getOrderById,
  getOrderHistory,
  deleteOrder,
  acknowledgeOrderUpdate,
  getTodayRevenue,
  getTotalRevenue,
  getRevenueByDateRange,
} from "../controllers/order.controller.js";
import { verifyAdmin } from "../middlewares/verifyAdmin.middleware.js";
import { verifyAdminOrKitchen } from "../middlewares/verifyAdminOrKitchen.middleware.js";

const orderRouter = express.Router();

// Rate limiters
const createOrderLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30,
  message: { success: false, message: "Too many order creation requests" },
});

const updateOrderLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 50,
  message: { success: false, message: "Too many update requests" },
});

const deleteOrderLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many delete requests" },
});

// ============================================
// REVENUE ROUTES
// ============================================
orderRouter.get("/revenue/today", verifyAdmin, getTodayRevenue);
orderRouter.get("/revenue/total", verifyAdmin, getTotalRevenue);
orderRouter.get("/revenue/range", verifyAdmin, getRevenueByDateRange);
orderRouter.get("/current", verifyAdminOrKitchen, getCurrentOrders);
orderRouter.get("/:id/history", verifyAdminOrKitchen, getOrderHistory);
orderRouter.get("/:id", verifyAdminOrKitchen, getOrderById);
orderRouter.post("/create", verifyAdmin, createOrderLimiter, createOrder);
orderRouter.put("/:id", verifyAdmin, updateOrderLimiter, updateOrder);
orderRouter.put("/:id/acknowledge", verifyAdminOrKitchen, acknowledgeOrderUpdate);
orderRouter.put("/:id/complete", verifyAdmin, completeOrder);
orderRouter.put("/:id/cancel", verifyAdmin, cancelOrder);
orderRouter.delete("/:id", verifyAdmin, deleteOrderLimiter, deleteOrder);

export default orderRouter;