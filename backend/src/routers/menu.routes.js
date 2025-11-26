import express from "express";
import rateLimit from "express-rate-limit";
import { addMenu, deleteMenu, getAllMenus, updateMenu } from "../controllers/menu.controller.js";
import { verifyAdmin } from "../middlewares/verifyAdmin.middleware.js";

const menuRouter = express.Router();

// Rate limiters
const addMenuLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many add menu requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const updateMenuLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many update requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const deleteMenuLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: "Too many delete attempts. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes - No multer middleware needed
menuRouter.get("/menu", verifyAdmin, getAllMenus);
menuRouter.post("/add", verifyAdmin, addMenuLimiter, addMenu);
menuRouter.put("/:id", verifyAdmin, updateMenuLimiter, updateMenu);
menuRouter.delete("/:id", verifyAdmin, deleteMenuLimiter, deleteMenu);

export default menuRouter;