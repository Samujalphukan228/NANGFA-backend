import express from "express";
import { addMenu, deleteMenu, getAllMenus, updateMenu } from "../controllers/menu.controller.js";
import { verifyAdmin } from "../middlewares/verifyAdmin.middleware.js";

const menuRouter = express.Router();

// Routes
menuRouter.get("/menu", verifyAdmin, getAllMenus);
menuRouter.post("/add", verifyAdmin, addMenu);
menuRouter.put("/:id", verifyAdmin, updateMenu);
menuRouter.delete("/:id", verifyAdmin, deleteMenu);

export default menuRouter;