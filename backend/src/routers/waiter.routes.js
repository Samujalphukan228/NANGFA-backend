import express from "express";
import {
  waiterGetOrders,
  waiterGetMenu,
  waiterCreateOrder,
  waiterUpdateOrder,
  waiterGetOrderById,
} from "../controllers/waiter.controller.js";
import { verifyWaiter } from "../middlewares/verifyWaiter.middleware.js";

const waiterRouter = express.Router();

// Menu (waiter needs to see the menu to place orders)
waiterRouter.get("/menu", verifyWaiter, waiterGetMenu);

// Orders
waiterRouter.get("/orders", verifyWaiter, waiterGetOrders);
waiterRouter.get("/orders/:id", verifyWaiter, waiterGetOrderById);
waiterRouter.post("/orders/create", verifyWaiter, waiterCreateOrder);
waiterRouter.put("/orders/:id", verifyWaiter, waiterUpdateOrder);

export default waiterRouter;