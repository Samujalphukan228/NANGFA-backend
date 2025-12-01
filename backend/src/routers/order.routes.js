// order.routes.js
import express from "express";
import {
  createOrder,
  updateOrder,
  completeOrder,
  cancelOrder,
  deleteOrder,
  acknowledgeOrderUpdate,
  getCurrentOrders,
  getOrdersByTables,
  getOrdersByCombinedTables,
  getOrdersByExactTables,
  getOrderById,
  getOrderHistory,
  getAllOrders,
  getTodayRevenue,
  getTotalRevenue,
  getRevenueByDateRange,
  getRevenueStats,
} from "../controllers/order.controller.js";
import { verifyAdmin } from "../middlewares/verifyAdmin.middleware.js";
import { verifyAdminOrKitchen } from "../middlewares/verifyAdminOrKitchen.middleware.js";

const orderRouter = express.Router();

orderRouter.get("/revenue/today", verifyAdmin, getTodayRevenue);
orderRouter.get("/revenue/total", verifyAdmin, getTotalRevenue);
orderRouter.get("/revenue/range", verifyAdmin, getRevenueByDateRange);
orderRouter.get("/revenue/stats", verifyAdmin, getRevenueStats);

orderRouter.get("/current", verifyAdminOrKitchen, getCurrentOrders);
orderRouter.get("/all", verifyAdmin, getAllOrders);
orderRouter.get("/by-tables", verifyAdminOrKitchen, getOrdersByTables);
orderRouter.get("/by-combined-tables", verifyAdminOrKitchen, getOrdersByCombinedTables);
orderRouter.get("/by-exact-tables", verifyAdminOrKitchen, getOrdersByExactTables);

orderRouter.get("/:id/history", verifyAdminOrKitchen, getOrderHistory);
orderRouter.get("/:id", verifyAdminOrKitchen, getOrderById);

orderRouter.post("/create", verifyAdmin, createOrder);
orderRouter.put("/:id", verifyAdmin, updateOrder);
orderRouter.put("/:id/acknowledge", verifyAdminOrKitchen, acknowledgeOrderUpdate);
orderRouter.put("/:id/complete", verifyAdmin, completeOrder);
orderRouter.put("/:id/cancel", verifyAdmin, cancelOrder);
orderRouter.delete("/:id", verifyAdmin, deleteOrder);

export default orderRouter;