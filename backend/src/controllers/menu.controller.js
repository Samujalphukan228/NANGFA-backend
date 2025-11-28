import { menuModel } from "../models/menu.model.js";

// Add Menu
export const addMenu = async (req, res) => {
    try {
        const { name, price, priority } = req.body;

        // Validation
        if (!name || !price) {
            return res.status(400).json({ 
                success: false,
                message: "Name and price are required" 
            });
        }

        if (isNaN(price) || Number(price) < 0) {
            return res.status(400).json({ 
                success: false,
                message: "Price must be a valid non-negative number" 
            });
        }

        const menuData = {
            name: name.trim(),
            price: Number(price),
            priority: priority === true || priority === "true" || priority === 1,
        };

        const menu = new menuModel(menuData);
        await menu.save();

        // Socket emit
        const io = req.app.get("io");
        if (io) {
            io.emit("menu:new", menu);
            io.emit("menu:refresh");
        }

        return res.status(201).json({
            success: true,
            message: "Menu added successfully",
            menu,
        });
    } catch (error) {
        console.error("Add menu error:", error);
        return res.status(500).json({ 
            success: false,
            message: "Failed to add menu item. Please try again." 
        });
    }
};

// Get All Menus
export const getAllMenus = async (req, res) => {
    try {
        const menus = await menuModel.find().sort({ priority: -1, date: -1 });
        
        return res.status(200).json({
            success: true,
            count: menus.length,
            menus,
        });
    } catch (error) {
        console.error("Get menus error:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Failed to fetch menu items. Please try again." 
        });
    }
};

// Update Menu
export const updateMenu = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, priority } = req.body;

        const menu = await menuModel.findById(id);
        if (!menu) {
            return res.status(404).json({ 
                success: false, 
                message: "Menu not found" 
            });
        }

        // Update fields
        if (name) menu.name = name.trim();
        if (price !== undefined) menu.price = Number(price);
        if (priority !== undefined) {
            menu.priority = priority === true || priority === "true" || priority === 1;
        }

        await menu.save();

        // Socket emit
        const io = req.app.get("io");
        if (io) {
            io.emit("menu:update", menu);
            io.emit("menu:refresh");
        }

        return res.status(200).json({
            success: true,
            message: "Menu updated successfully",
            menu,
        });
    } catch (error) {
        console.error("Update menu error:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Failed to update menu item. Please try again." 
        });
    }
};

// Delete Menu
export const deleteMenu = async (req, res) => {
    try {
        const { id } = req.params;
        const menu = await menuModel.findById(id);

        if (!menu) {
            return res.status(404).json({ 
                success: false, 
                message: "Menu not found" 
            });
        }

        await menuModel.findByIdAndDelete(id);

        // Socket emit
        const io = req.app.get("io");
        if (io) {
            io.emit("menu:delete", { id });
            io.emit("menu:refresh");
        }

        return res.status(200).json({
            success: true,
            message: "Menu deleted successfully",
        });
    } catch (error) {
        console.error("Delete menu error:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Failed to delete menu item. Please try again." 
        });
    }
};