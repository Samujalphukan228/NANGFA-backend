import express from "express";
import { 
    addMenu, 
    deleteMenu, 
    getAllMenus, 
    updateMenu,
    getMenusByCategory,
    getAllCategories,
    getMenusGroupedByCategory
} from "../controllers/menu.controller.js";
import { verifyAdmin } from "../middlewares/verifyAdmin.middleware.js";

const menuRouter = express.Router();

// Menu Routes
menuRouter.get("/menu", verifyAdmin, getAllMenus);
menuRouter.post("/add", verifyAdmin, addMenu);
menuRouter.put("/:id", verifyAdmin, updateMenu);
menuRouter.delete("/:id", verifyAdmin, deleteMenu);
menuRouter.get("/categories", verifyAdmin, getAllCategories);
menuRouter.get("/grouped", verifyAdmin, getMenusGroupedByCategory);
menuRouter.get("/category/:category", verifyAdmin, getMenusByCategory);

export default menuRouter;