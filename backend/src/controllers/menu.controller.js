import { v2 as cloudinary } from "cloudinary";
import { menuModel } from "../models/menu.model.js";

export const addMenu = async (req, res) => {
  try {
    const { name, price } = req.body;

    if (!name || !price) {
      return res.status(400).json({ message: "Name and price are required" });
    }

    if (isNaN(price) || Number(price) < 0) {
      return res.status(400).json({ message: "Price must be a valid non-negative number" });
    }

    // Handle single image
    const image = req.file;

    if (!image) {
      return res.status(400).json({ message: "Image is required" });
    }

    // Upload to cloudinary
    const result = await cloudinary.uploader.upload(image.path, {
      folder: "restaurant/menu",
      resource_type: "image",
    });

    const menuData = {
      name: name.trim(),
      price: Number(price),
      image: [result.secure_url], // Array with one image
    };

    const menu = new menuModel(menuData);
    await menu.save();

    const io = req.app.get("io");
    io.emit("menu:new", menu);
    io.emit("menu:refresh");

    return res.status(201).json({
      success: true,
      message: "Menu added successfully",
      menu,
    });
  } catch (error) {
    return res.status(500).json({ 
      message: "Failed to add menu item. Please try again." 
    });
  }
};

export const getAllMenus = async (req, res) => {
  try {
    const menus = await menuModel.find().sort({ date: -1 });
    return res.status(200).json({
      success: true,
      count: menus.length,
      menus,
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch menu items. Please try again." 
    });
  }
};

export const updateMenu = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price } = req.body;

    const menu = await menuModel.findById(id);
    if (!menu) {
      return res.status(404).json({ 
        success: false, 
        message: "Menu not found" 
      });
    }

    // Handle single image upload
    const image = req.file;

    if (image) {
      // Delete old image from Cloudinary
      if (menu.image && menu.image.length > 0) {
        const publicId = menu.image[0].split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      }

      // Upload new image
      const result = await cloudinary.uploader.upload(image.path, {
        folder: "restaurant/menu",
        resource_type: "image",
      });
      menu.image = [result.secure_url];
    }

    // Update fields
    menu.name = name ? name.trim() : menu.name;
    menu.price = price ? Number(price) : menu.price;

    await menu.save();

    const io = req.app.get("io");
    io.emit("menu:update", menu);
    io.emit("menu:refresh");

    return res.status(200).json({
      success: true,
      message: "Menu updated successfully",
      menu,
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Failed to update menu item. Please try again." 
    });
  }
};

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

    // Delete image from Cloudinary
    if (menu.image && menu.image.length > 0) {
      const publicId = menu.image[0].split('/').slice(-2).join('/').split('.')[0];
      await cloudinary.uploader.destroy(publicId);
    }

    await menuModel.findByIdAndDelete(id);

    const io = req.app.get("io");
    io.emit("menu:delete", { id });
    io.emit("menu:refresh");

    return res.status(200).json({
      success: true,
      message: "Menu deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Failed to delete menu item. Please try again." 
    });
  }
};