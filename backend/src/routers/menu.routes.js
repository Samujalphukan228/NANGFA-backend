import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { addMenu, deleteMenu, getAllMenus, updateMenu } from "../controllers/menu.controller.js";
import { verifyAdmin } from "../middlewares/verifyAdmin.middleware.js";


const menuRouter = express.Router();
const upload = multer({ dest: "uploads/" });

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

menuRouter.get("/menu", verifyAdmin,getAllMenus)
menuRouter.post(
  "/add",
  verifyAdmin,
  addMenuLimiter,
  upload.single("image"), 
  addMenu
);

menuRouter.put(
  "/:id",
  verifyAdmin,
  updateMenuLimiter,
  upload.single("image"), 
  updateMenu
);

menuRouter.delete("/:id", verifyAdmin, deleteMenuLimiter, deleteMenu);

export default menuRouter