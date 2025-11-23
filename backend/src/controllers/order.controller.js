import { orderModel } from "../models/order.model.js";
import { menuModel } from "../models/menu.model.js";
import { revenueModel } from "../models/revenue.model.js";

export const createOrder = async (req, res) => {
  try {
    const { menuItems, tableNumber } = req.body;

    if (!menuItems || menuItems.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Menu items are required" 
      });
    }

    let totalPrice = 0;
    
    for (const item of menuItems) {
      const menu = await menuModel.findById(item.menuId);
      
      if (!menu) {
        return res.status(404).json({ 
          success: false, 
          message: `Menu item not found: ${item.menuId}` 
        });
      }
      
      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({ 
          success: false, 
          message: "Quantity must be greater than 0" 
        });
      }
      
      totalPrice += menu.price * item.quantity;
    }

    const orderData = {
      menuItems,
      totalPrice,
      tableNumber: tableNumber || null,
      createdBy: req.admin._id,
      status: 'preparing',
    };

    const order = new orderModel(orderData);
    await order.save();

    await order.populate('menuItems.menuId', 'name price image category');

    const io = req.app.get("io");
    io.to('kitchen').emit("order:new", order);

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      order,
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Failed to create order. Please try again."
    });
  }
};

export const completeOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await orderModel
      .findById(id)
      .populate('menuItems.menuId', 'name price image category');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    const totalPrice = order.totalPrice;

    const updatedOrder = await orderModel.findByIdAndUpdate(
      id,
      { status: 'completed' },
      { new: true, runValidators: false }
    ).populate('menuItems.menuId', 'name price image category');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await revenueModel.findOneAndUpdate(
      { date: today },
      { 
        $inc: { 
          amount: totalPrice,
          orderCount: 1
        }
      },
      { upsert: true, new: true }
    );

    const io = req.app.get("io");
    io.emit("order:completed", updatedOrder);
    io.to('kitchen').emit("order:completed", updatedOrder);
    io.emit("revenue:update");

    return res.status(200).json({
      success: true,
      message: "Order completed and revenue updated",
      order: updatedOrder,
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Failed to complete order. Please try again."
    });
  }
};

export const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { menuItems, tableNumber, status } = req.body;

    const order = await orderModel.findById(id);

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    let totalPrice = order.totalPrice;

    if (menuItems && menuItems.length > 0) {
      totalPrice = 0;
      
      for (const item of menuItems) {
        const menu = await menuModel.findById(item.menuId);
        
        if (!menu) {
          return res.status(404).json({ 
            success: false, 
            message: `Menu item not found: ${item.menuId}` 
          });
        }
        
        if (!item.quantity || item.quantity <= 0) {
          return res.status(400).json({ 
            success: false, 
            message: "Quantity must be greater than 0" 
          });
        }
        
        totalPrice += menu.price * item.quantity;
      }
    }

    const updatedOrder = await orderModel.findByIdAndUpdate(
      id,
      {
        ...(menuItems && { menuItems }),
        ...(tableNumber !== undefined && { tableNumber }),
        ...(status && { status }),
        totalPrice,
      },
      { new: true, runValidators: false }
    ).populate('menuItems.menuId', 'name price image category');

    const io = req.app.get("io");
    io.to('kitchen').emit("order:update", updatedOrder);
    io.emit("order:update", updatedOrder);

    return res.status(200).json({
      success: true,
      message: "Order updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Failed to update order. Please try again."
    });
  }
};

export const getCurrentOrders = async (req, res) => {
  try {
    const orders = await orderModel
      .find({ status: 'preparing' })
      .populate('menuItems.menuId', 'name price image category')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch orders. Please try again."
    });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const order = await orderModel
      .findById(id)
      .populate('menuItems.menuId', 'name price image category');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    return res.status(200).json({ 
      success: true, 
      order 
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch order. Please try again."
    });
  }
};

export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    
    const order = await orderModel.findById(id);

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    await orderModel.findByIdAndDelete(id);

    const io = req.app.get("io");
    io.to('kitchen').emit("order:delete", { id });
    io.emit("order:delete", { id });

    return res.status(200).json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Failed to delete order. Please try again."
    });
  }
};

export const getTodayRevenue = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const revenue = await revenueModel.findOne({ date: today });

    return res.status(200).json({
      success: true,
      revenue: revenue ? revenue.amount : 0,
      orderCount: revenue ? revenue.orderCount : 0,
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch today's revenue. Please try again."
    });
  }
};

export const getTotalRevenue = async (req, res) => {
  try {
    const result = await revenueModel.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalOrders: { $sum: "$orderCount" }
        }
      }
    ]);

    const totalRevenue = result.length > 0 ? result[0].totalRevenue : 0;
    const totalOrders = result.length > 0 ? result[0].totalOrders : 0;

    return res.status(200).json({
      success: true,
      totalRevenue,
      totalOrders,
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch total revenue. Please try again."
    });
  }
};

export const getRevenueByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const revenues = await revenueModel
      .find({
        date: { $gte: start, $lte: end }
      })
      .sort({ date: -1 });

    const totalRevenue = revenues.reduce((sum, rev) => sum + rev.amount, 0);
    const totalOrders = revenues.reduce((sum, rev) => sum + rev.orderCount, 0);

    return res.status(200).json({
      success: true,
      totalRevenue,
      totalOrders,
      dailyRevenues: revenues,
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch revenue data. Please try again."
    });
  }
};