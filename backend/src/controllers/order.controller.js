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
      console.log('🔍 Checking menu item:', item.menuId);
      
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
      status: 'preparing', // ✅ Make sure status is set
    };

    const order = new orderModel(orderData);
    await order.save();

    // ✅ Populate menu items
    await order.populate('menuItems.menuId', 'name price image category');

    // ✅ GET SOCKET AND EMIT TO KITCHEN ROOM
    const io = req.app.get("io");
    
    // Emit to kitchen room specifically
    io.to('kitchen').emit("order:new", order);
    
    console.log('=================================');
    console.log('📢 EMITTED order:new TO KITCHEN');
    console.log('Order ID:', order._id);
    console.log('Table:', tableNumber || 'Takeaway');
    console.log('Items:', menuItems.length);
    console.log('Total Price:', totalPrice);
    console.log('Kitchen room size:', io.sockets.adapter.rooms.get('kitchen')?.size || 0);
    console.log('=================================');

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      order,
    });
  } catch (error) {
    console.error("❌ CREATE ORDER ERROR:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error",
      error: error.message
    });
  }
};

export const completeOrder = async (req, res) => {
  try {
    const { id } = req.params;

    // Get the order to access totalPrice
    const order = await orderModel
      .findById(id)
      .populate('menuItems.menuId', 'name price image category');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    // Store totalPrice before updating
    const totalPrice = order.totalPrice;

    // Update order status
    const updatedOrder = await orderModel.findByIdAndUpdate(
      id,
      { status: 'completed' },
      { new: true, runValidators: false }
    ).populate('menuItems.menuId', 'name price image category');

    // Add to revenue (daily)
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

    // ✅ EMIT TO ALL CLIENTS AND KITCHEN
    const io = req.app.get("io");
    io.emit("order:completed", updatedOrder); // All clients
    io.to('kitchen').emit("order:completed", updatedOrder); // Kitchen specifically
    io.emit("revenue:update"); // Trigger revenue refresh

    console.log('=================================');
    console.log('✅ EMITTED order:completed');
    console.log('Order ID:', updatedOrder._id);
    console.log('Revenue added:', totalPrice);
    console.log('=================================');

    return res.status(200).json({
      success: true,
      message: "Order completed and revenue updated",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("❌ completeOrder error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
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

    // Recalculate total price if menuItems changed
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

    // Update order
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

    // ✅ EMIT TO KITCHEN
    const io = req.app.get("io");
    io.to('kitchen').emit("order:update", updatedOrder);
    io.emit("order:update", updatedOrder); // Also emit to all

    console.log('=================================');
    console.log('🔄 EMITTED order:update TO KITCHEN');
    console.log('Order ID:', updatedOrder._id);
    console.log('Status:', updatedOrder.status);
    console.log('=================================');

    return res.status(200).json({
      success: true,
      message: "Order updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("❌ updateOrder error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
    });
  }
};

export const getCurrentOrders = async (req, res) => {
  try {
    const orders = await orderModel
      .find({ status: 'preparing' }) // ✅ Only get preparing orders for kitchen
      .populate('menuItems.menuId', 'name price image category')
      .sort({ createdAt: -1 }); // ✅ Use createdAt instead of date

    console.log('📦 getCurrentOrders - Found:', orders.length, 'preparing orders');

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("❌ getCurrentOrders error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
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
    console.error("❌ getOrderById error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
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

    // ✅ EMIT TO KITCHEN AND ALL CLIENTS
    const io = req.app.get("io");
    io.to('kitchen').emit("order:delete", { id });
    io.emit("order:delete", { id }); // Also emit to all

    console.log('=================================');
    console.log('🗑️ EMITTED order:delete TO KITCHEN');
    console.log('Order ID:', id);
    console.log('=================================');

    return res.status(200).json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error) {
    console.error("❌ deleteOrder error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
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
    console.error("❌ getTodayRevenue error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
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
    console.error("❌ getTotalRevenue error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
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
    console.error("❌ getRevenueByDateRange error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
    });
  }
};