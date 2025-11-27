import { orderModel } from "../models/order.model.js";
import { menuModel } from "../models/menu.model.js";
import { revenueModel } from "../models/revenue.model.js";


/**
 * Validate and calculate order total
 */
const validateAndCalculateTotal = async (menuItems) => {
  let totalPrice = 0;
  const validatedItems = [];

  for (const item of menuItems) {
    const menu = await menuModel.findById(item.menuId);
    
    if (!menu) {
      throw new Error(`Menu item not found: ${item.menuId}`);
    }
    
    if (!item.quantity || item.quantity <= 0) {
      throw new Error(`Invalid quantity for ${menu.name}`);
    }
    
    totalPrice += menu.price * item.quantity;
    validatedItems.push({
      menuId: item.menuId,
      name: menu.name,
      price: menu.price,
      quantity: item.quantity
    });
  }

  return { totalPrice, validatedItems };
};

/**
 * Compare old and new orders to find changes
 */
const findOrderChanges = (oldOrder, newMenuItems) => {
  const changes = {
    newItems: [],           // Items added
    removedItems: [],       // Items removed
    updatedItems: [],       // Items with quantity changed
    added: [],              // For history
    removed: [],            // For history
    updated: []             // For history
  };

  // Create maps for easy comparison
  const oldItemsMap = new Map();
  oldOrder.menuItems.forEach(item => {
    const menuId = item.menuId._id ? item.menuId._id.toString() : item.menuId.toString();
    oldItemsMap.set(menuId, {
      quantity: item.quantity,
      name: item.menuId.name || 'Unknown'
    });
  });

  const newItemsMap = new Map();
  newMenuItems.forEach(item => {
    const menuId = item.menuId.toString();
    newItemsMap.set(menuId, {
      quantity: item.quantity,
      name: item.name
    });
  });

  // Find NEW items (in new but not in old)
  newItemsMap.forEach((newItem, menuId) => {
    if (!oldItemsMap.has(menuId)) {
      changes.newItems.push(menuId);
      changes.added.push({
        menuId,
        name: newItem.name,
        quantity: newItem.quantity
      });
      console.log(`🆕 NEW: ${newItem.name} (×${newItem.quantity})`);
    }
  });

  // Find REMOVED items (in old but not in new)
  oldItemsMap.forEach((oldItem, menuId) => {
    if (!newItemsMap.has(menuId)) {
      changes.removedItems.push({
        menuId,
        name: oldItem.name,
        quantity: oldItem.quantity
      });
      changes.removed.push({
        menuId,
        name: oldItem.name,
        quantity: oldItem.quantity
      });
      console.log(`🗑️ REMOVED: ${oldItem.name} (×${oldItem.quantity})`);
    }
  });

  // Find UPDATED items (in both but quantity changed)
  newItemsMap.forEach((newItem, menuId) => {
    const oldItem = oldItemsMap.get(menuId);
    if (oldItem && oldItem.quantity !== newItem.quantity) {
      const type = newItem.quantity > oldItem.quantity ? 'increased' : 'decreased';
      changes.updatedItems.push({
        menuId,
        oldQuantity: oldItem.quantity,
        newQuantity: newItem.quantity,
        type
      });
      changes.updated.push({
        menuId,
        name: newItem.name,
        oldQuantity: oldItem.quantity,
        newQuantity: newItem.quantity
      });
      console.log(`📝 UPDATED: ${newItem.name} (${oldItem.quantity} → ${newItem.quantity}) [${type}]`);
    }
  });

  return changes;
};

// ============================================
// CREATE ORDER
// ============================================

export const createOrder = async (req, res) => {
  try {
    const { menuItems, tableNumber } = req.body;

    // Validation
    if (!menuItems || menuItems.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Menu items are required" 
      });
    }

    // Validate and calculate total
    const { totalPrice, validatedItems } = await validateAndCalculateTotal(menuItems);

    // Create order
    const orderData = {
      menuItems: menuItems.map(item => ({
        menuId: item.menuId,
        quantity: item.quantity
      })),
      totalPrice,
      tableNumber: tableNumber || null,
      createdBy: req.admin._id,
      status: 'preparing',
      updatedItems: [],
      newItems: [],
      removedItems: [],
      lastUpdatedAt: null,
      updateHistory: []
    };

    const order = new orderModel(orderData);
    await order.save();

    // Populate for response
    await order.populate('menuItems.menuId', 'name price image category');

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.to('kitchen').emit("order:new", order);
    }

    console.log(`✅ Order created: ${order._id} (${validatedItems.length} items, ₹${totalPrice})`);

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      order,
    });
  } catch (error) {
    console.error("❌ Create order error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to create order"
    });
  }
};

// ============================================
// UPDATE ORDER - COMPREHENSIVE (FIXED)
// ============================================

export const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { menuItems, tableNumber, status } = req.body;

    // Find existing order
    const order = await orderModel
      .findById(id)
      .populate('menuItems.menuId', 'name price image category');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    // Check if order can be updated
    if (order.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: "Cannot update completed order"
      });
    }

    let updateData = {};
    let changes = null;
    let totalPrice = order.totalPrice;

    // Handle menu items update
    if (menuItems && menuItems.length >= 0) {
      // Validate if order would be empty
      if (menuItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Order must have at least one item. Use delete instead."
        });
      }

      // Validate and calculate new total
      const { totalPrice: newTotal, validatedItems } = await validateAndCalculateTotal(menuItems);
      totalPrice = newTotal;

      // Find all changes
      changes = findOrderChanges(order, validatedItems);

      // Prepare update data
      updateData.menuItems = menuItems.map(item => ({
        menuId: item.menuId,
        quantity: item.quantity
      }));
      updateData.totalPrice = totalPrice;
      
      // ✅ IMPORTANT: Store updatedItems with FULL change info
      updateData.updatedItems = changes.updatedItems.map(item => ({
        menuId: item.menuId,
        oldQuantity: item.oldQuantity,
        newQuantity: item.newQuantity,
        change: item.newQuantity - item.oldQuantity
      }));
      
      updateData.newItems = changes.newItems;
      updateData.removedItems = changes.removedItems;

      // Only update timestamp if there are actual changes
      if (changes.newItems.length > 0 || 
          changes.removedItems.length > 0 || 
          changes.updatedItems.length > 0) {
        updateData.lastUpdatedAt = new Date();

        // Add to update history
        updateData.$push = {
          updateHistory: {
            updatedAt: new Date(),
            updatedBy: req.admin._id,
            changes: {
              added: changes.added,
              removed: changes.removed,
              updated: changes.updated
            }
          }
        };
      }
    }

    // Handle table number update
    if (tableNumber !== undefined) {
      updateData.tableNumber = tableNumber;
    }

    // Handle status update
    if (status) {
      if (!['preparing', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status. Use 'preparing', 'completed', or 'cancelled'"
        });
      }
      updateData.status = status;

      // Clear highlights if status changes to completed or cancelled
      if (status === 'completed' || status === 'cancelled') {
        updateData.updatedItems = [];
        updateData.newItems = [];
        updateData.removedItems = [];
      }
    }

    // Perform update
    const updatedOrder = await orderModel
      .findByIdAndUpdate(id, updateData, { new: true, runValidators: false })
      .populate('menuItems.menuId', 'name price image category');

    // Emit socket events
    const io = req.app.get("io");
    if (io) {
      // ✅ FIX: Preserve change info when emitting
      const socketData = {
        ...updatedOrder.toObject(),
        updatedItems: updatedOrder.updatedItems.map(item => {
          // If it's already an object with change info
          if (typeof item === 'object' && item.menuId) {
            return {
              menuId: item.menuId.toString(),
              oldQuantity: item.oldQuantity,
              newQuantity: item.newQuantity,
              change: item.change || (item.newQuantity - item.oldQuantity)
            };
          }
          // Fallback for old format
          return { menuId: item.toString() };
        }),
        newItems: updatedOrder.newItems.map(id => id.toString()),
        removedItems: updatedOrder.removedItems
      };

      // Send to kitchen with full change details
      io.to('kitchen').emit("order:update", socketData);
      io.emit("order:update", socketData);

      // Log what we're sending for debugging
      console.log('📤 Emitting order:update with changes:', {
        orderId: id,
        updatedItems: socketData.updatedItems,
        newItems: socketData.newItems.length,
        removedItems: socketData.removedItems.length
      });

      // Also emit specific events for significant changes
      if (changes) {
        if (changes.newItems.length > 0) {
          io.to('kitchen').emit("order:items-added", {
            orderId: id,
            items: changes.added
          });
        }
        if (changes.removedItems.length > 0) {
          io.to('kitchen').emit("order:items-removed", {
            orderId: id,
            items: changes.removed
          });
        }
      }
    }

    console.log(`✅ Order updated: ${id}`);
    if (changes) {
      console.log(`   - Added: ${changes.newItems.length}`);
      console.log(`   - Removed: ${changes.removedItems.length}`);
      console.log(`   - Updated: ${changes.updatedItems.length}`);
      // Log actual quantity changes
      changes.updatedItems.forEach(item => {
        console.log(`   - ${item.menuId}: ${item.oldQuantity} → ${item.newQuantity} (${item.newQuantity > item.oldQuantity ? '+' : ''}${item.newQuantity - item.oldQuantity})`);
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order updated successfully",
      order: updatedOrder,
      changes: changes ? {
        itemsAdded: changes.added,
        itemsRemoved: changes.removed,
        itemsUpdated: changes.updated
      } : null
    });
  } catch (error) {
    console.error("❌ Update order error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to update order"
    });
  }
};

// ============================================
// COMPLETE ORDER
// ============================================

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

    if (order.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: "Order is already completed"
      });
    }

    const totalPrice = order.totalPrice;

    // Update order to completed
    const updatedOrder = await orderModel.findByIdAndUpdate(
      id,
      { 
        status: 'completed',
        updatedItems: [],
        newItems: [],
        removedItems: [],
        lastUpdatedAt: null,
      },
      { new: true, runValidators: false }
    ).populate('menuItems.menuId', 'name price image category');

    // Update revenue
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

    // Emit socket events
    const io = req.app.get("io");
    if (io) {
      io.emit("order:completed", updatedOrder);
      io.to('kitchen').emit("order:completed", updatedOrder);
      io.emit("revenue:update");
    }

    console.log(`✅ Order completed: ${id} (₹${totalPrice})`);

    return res.status(200).json({
      success: true,
      message: "Order completed and revenue updated",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("❌ Complete order error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to complete order"
    });
  }
};

// ============================================
// CANCEL ORDER
// ============================================

export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await orderModel
      .findById(id)
      .populate('menuItems.menuId', 'name price image category');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    if (order.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel completed order"
      });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: "Order is already cancelled"
      });
    }

    // Update order to cancelled
    const updatedOrder = await orderModel.findByIdAndUpdate(
      id,
      { 
        status: 'cancelled',
        updatedItems: [],
        newItems: [],
        removedItems: [],
        lastUpdatedAt: null,
        cancellationReason: reason || 'No reason provided',
        cancelledAt: new Date(),
        cancelledBy: req.admin._id
      },
      { new: true, runValidators: false }
    ).populate('menuItems.menuId', 'name price image category');

    // Emit socket events
    const io = req.app.get("io");
    if (io) {
      io.to('kitchen').emit("order:cancelled", updatedOrder);
      io.emit("order:cancelled", updatedOrder);
    }

    console.log(`❌ Order cancelled: ${id}`);

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("❌ Cancel order error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to cancel order"
    });
  }
};

// ============================================
// DELETE ORDER
// ============================================

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

    // Prevent deleting completed orders (optional - remove if you want to allow)
    if (order.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: "Cannot delete completed orders. Revenue already recorded."
      });
    }

    await orderModel.findByIdAndDelete(id);

    // Emit socket events
    const io = req.app.get("io");
    if (io) {
      io.to('kitchen').emit("order:delete", { id });
      io.emit("order:delete", { id });
    }

    console.log(`🗑️ Order deleted: ${id}`);

    return res.status(200).json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error) {
    console.error("❌ Delete order error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to delete order"
    });
  }
};

// ============================================
// ACKNOWLEDGE ORDER UPDATE
// ============================================

export const acknowledgeOrderUpdate = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await orderModel.findById(id);

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    const updatedOrder = await orderModel.findByIdAndUpdate(
      id,
      {
        updatedItems: [],
        newItems: [],
        removedItems: [],
        lastUpdatedAt: null,
      },
      { new: true, runValidators: false }
    ).populate('menuItems.menuId', 'name price image category');

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.to('kitchen').emit("order:acknowledged", { id: order._id });
    }

    console.log(`✅ Order acknowledged: ${id}`);

    return res.status(200).json({
      success: true,
      message: "Update acknowledged",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("❌ Acknowledge error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to acknowledge update"
    });
  }
};

// ============================================
// GET CURRENT ORDERS
// ============================================

export const getCurrentOrders = async (req, res) => {
  try {
    const { status, tableNumber } = req.query;

    let filter = {};
    
    if (status) {
      filter.status = status;
    } else {
      filter.status = 'preparing'; // Default to preparing
    }

    if (tableNumber) {
      filter.tableNumber = parseInt(tableNumber);
    }

    const orders = await orderModel
      .find(filter)
      .populate('menuItems.menuId', 'name price image category')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("❌ Get orders error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch orders"
    });
  }
};

// ============================================
// GET ORDER BY ID
// ============================================

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const order = await orderModel
      .findById(id)
      .populate('menuItems.menuId', 'name price image category')
      .populate('createdBy', 'name email')
      .populate('updateHistory.updatedBy', 'name');

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
    console.error("❌ Get order error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch order"
    });
  }
};

// ============================================
// GET ORDER HISTORY
// ============================================

export const getOrderHistory = async (req, res) => {
  try {
    const { id } = req.params;
    
    const order = await orderModel
      .findById(id)
      .populate('updateHistory.updatedBy', 'name email')
      .select('updateHistory');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    return res.status(200).json({ 
      success: true, 
      history: order.updateHistory 
    });
  } catch (error) {
    console.error("❌ Get history error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch order history"
    });
  }
};

// ============================================
// REVENUE FUNCTIONS
// ============================================

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
    console.error("❌ Get today revenue error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch today's revenue"
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
    console.error("❌ Get total revenue error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch total revenue"
    });
  }
};

export const getRevenueByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required"
      });
    }

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
    console.error("❌ Get revenue range error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch revenue data"
    });
  }
};