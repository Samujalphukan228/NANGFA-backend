// order.controller.js
import { orderModel } from "../models/order.model.js";
import { menuModel } from "../models/menu.model.js";
import { revenueModel } from "../models/revenue.model.js";



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

const normalizeTableNumber = (tableNumber) => {
  // Handle null/undefined
  if (tableNumber === null || tableNumber === undefined) {
    return [];
  }
  
  // If already an array, clean and return
  if (Array.isArray(tableNumber)) {
    return tableNumber
      .filter(t => t !== null && t !== undefined && t !== '')
      .map(t => parseInt(t))
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);  // Sort ascending
  }
  
  // If string like "4,5" or "4, 5"
  if (typeof tableNumber === 'string') {
    if (tableNumber.trim() === '') {
      return [];
    }
    if (tableNumber.includes(',')) {
      return tableNumber
        .split(',')
        .map(t => parseInt(t.trim()))
        .filter(t => !isNaN(t))
        .sort((a, b) => a - b);
    }
    const num = parseInt(tableNumber.trim());
    return isNaN(num) ? [] : [num];
  }
  
  // If single number
  if (typeof tableNumber === 'number') {
    return isNaN(tableNumber) ? [] : [tableNumber];
  }
  
  return [];
};

const formatTableDisplay = (tableNumbers) => {
  if (!tableNumbers || tableNumbers.length === 0) {
    return 'No Table';
  }
  if (tableNumbers.length === 1) {
    return `Table ${tableNumbers[0]}`;
  }
  return `Tables ${tableNumbers.join(', ')}`;
};

const findOrderChanges = (oldOrder, newMenuItems) => {
  const changes = {
    newItems: [],
    removedItems: [],
    updatedItems: [],
    added: [],
    removed: [],
    updated: []
  };

  // Create map of old items
  const oldItemsMap = new Map();
  oldOrder.menuItems.forEach(item => {
    const menuId = item.menuId._id ? item.menuId._id.toString() : item.menuId.toString();
    oldItemsMap.set(menuId, {
      quantity: item.quantity,
      name: item.menuId.name || 'Unknown'
    });
  });

  // Create map of new items
  const newItemsMap = new Map();
  newMenuItems.forEach(item => {
    const menuId = item.menuId.toString();
    newItemsMap.set(menuId, {
      quantity: item.quantity,
      name: item.name
    });
  });

  // Find new items (in new but not in old)
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

  // Find removed items (in old but not in new)
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

  // Find updated items (quantity changed)
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

const getAdminId = (req) => {
  if (req.admin) {
    if (req.admin._id) {
      return req.admin._id.toString();
    }
    if (req.admin.id) {
      return req.admin.id.toString();
    }
    if (req.admin.name) {
      return req.admin.name;
    }
  }
  return 'admin';
};

export const createOrder = async (req, res) => {
  try {
    const { menuItems, tableNumber } = req.body;

    // Validate menu items
    if (!menuItems || menuItems.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Menu items are required" 
      });
    }

    // Validate and calculate total
    const { totalPrice, validatedItems } = await validateAndCalculateTotal(menuItems);

    // ✅ Normalize tableNumber to array
    const normalizedTableNumber = normalizeTableNumber(tableNumber);

    // Create order data
    const orderData = {
      menuItems: menuItems.map(item => ({
        menuId: item.menuId,
        quantity: item.quantity
      })),
      totalPrice,
      tableNumber: normalizedTableNumber,
      createdBy: getAdminId(req),
      status: 'preparing',
      updatedItems: [],
      newItems: [],
      removedItems: [],
      lastUpdatedAt: null,
      updateHistory: []
    };

    // Save order
    const order = new orderModel(orderData);
    await order.save();

    // Populate menu details
    await order.populate('menuItems.menuId', 'name price image category');

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      console.log('📤 Emitting order:new to all rooms');
      
      io.to('kitchen').emit("order:new", order);
      io.to('admin').emit("order:new", order);
      io.emit("order:new", order);
      
      console.log(`✅ Order created: ${order._id}, ${formatTableDisplay(normalizedTableNumber)}, Total: ₹${totalPrice}`);
    } else {
      console.error('❌ Socket.io instance not found!');
    }

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

    // Cannot update completed order
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
      if (menuItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Order must have at least one item. Use delete instead."
        });
      }

      // Validate and calculate new total
      const { totalPrice: newTotal, validatedItems } = await validateAndCalculateTotal(menuItems);
      totalPrice = newTotal;

      // Find what changed
      changes = findOrderChanges(order, validatedItems);

      // Update menu items
      updateData.menuItems = menuItems.map(item => ({
        menuId: item.menuId,
        quantity: item.quantity
      }));
      updateData.totalPrice = totalPrice;
      
      // Track changes
      updateData.updatedItems = changes.updatedItems.map(item => ({
        menuId: item.menuId,
        oldQuantity: item.oldQuantity,
        newQuantity: item.newQuantity,
        change: item.newQuantity - item.oldQuantity,
        type: item.type
      }));
      
      updateData.newItems = changes.newItems;
      updateData.removedItems = changes.removedItems;

      // Add to update history if there are changes
      if (changes.newItems.length > 0 || 
          changes.removedItems.length > 0 || 
          changes.updatedItems.length > 0) {
        updateData.lastUpdatedAt = new Date();

        updateData.$push = {
          updateHistory: {
            updatedAt: new Date(),
            updatedBy: getAdminId(req),
            changes: {
              added: changes.added,
              removed: changes.removed,
              updated: changes.updated
            }
          }
        };
      }
    }

    // ✅ Handle tableNumber update
    if (tableNumber !== undefined) {
      updateData.tableNumber = normalizeTableNumber(tableNumber);
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

      // Clear change tracking on completion/cancellation
      if (status === 'completed' || status === 'cancelled') {
        updateData.updatedItems = [];
        updateData.newItems = [];
        updateData.removedItems = [];
      }
    }

    // Apply update
    const updatedOrder = await orderModel
      .findByIdAndUpdate(id, updateData, { new: true, runValidators: false })
      .populate('menuItems.menuId', 'name price image category');

    // Emit socket events
    const io = req.app.get("io");
    if (io) {
      const socketData = {
        ...updatedOrder.toObject(),
        updatedItems: updatedOrder.updatedItems.map(item => {
          if (typeof item === 'object' && item.menuId) {
            return {
              menuId: item.menuId.toString(),
              oldQuantity: item.oldQuantity,
              newQuantity: item.newQuantity,
              change: item.change || (item.newQuantity - item.oldQuantity),
              type: item.type
            };
          }
          return { menuId: item.toString() };
        }),
        newItems: updatedOrder.newItems.map(id => id.toString()),
        removedItems: updatedOrder.removedItems,
        tableDisplayText: formatTableDisplay(updatedOrder.tableNumber)
      };

      io.to('kitchen').emit("order:update", socketData);
      io.to('admin').emit("order:update", socketData);
      io.emit("order:update", socketData);

      console.log('📤 Emitting order:update:', {
        orderId: id,
        tableNumber: updatedOrder.tableNumber,
        updatedItemsCount: socketData.updatedItems.length,
        newItemsCount: socketData.newItems.length,
        removedItemsCount: socketData.removedItems.length
      });

      // Emit specific events for kitchen
      if (changes) {
        if (changes.newItems.length > 0) {
          io.to('kitchen').emit("order:items-added", {
            orderId: id,
            items: changes.added,
            tableNumber: updatedOrder.tableNumber
          });
        }
        if (changes.removedItems.length > 0) {
          io.to('kitchen').emit("order:items-removed", {
            orderId: id,
            items: changes.removed,
            tableNumber: updatedOrder.tableNumber
          });
        }
        if (changes.updatedItems.length > 0) {
          io.to('kitchen').emit("order:items-updated", {
            orderId: id,
            items: changes.updated,
            tableNumber: updatedOrder.tableNumber
          });
        }
      }
    }

    console.log(`✅ Order updated: ${id}, ${formatTableDisplay(updatedOrder.tableNumber)}`);
    if (changes) {
      console.log(`   - Added: ${changes.newItems.length}`);
      console.log(`   - Removed: ${changes.removedItems.length}`);
      console.log(`   - Updated: ${changes.updatedItems.length}`);
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

export const completeOrder = async (req, res) => {
  try {
    const { id } = req.params;

    // Find order
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

    if (order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: "Cannot complete a cancelled order"
      });
    }

    const totalPrice = order.totalPrice;

    // Update order status
    const updatedOrder = await orderModel.findByIdAndUpdate(
      id,
      { 
        status: 'completed',
        updatedItems: [],
        newItems: [],
        removedItems: [],
        lastUpdatedAt: null,
        completedAt: new Date(),
        completedBy: getAdminId(req)
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
      const socketData = {
        ...updatedOrder.toObject(),
        tableDisplayText: formatTableDisplay(updatedOrder.tableNumber)
      };
      
      io.emit("order:completed", socketData);
      io.to('kitchen').emit("order:completed", socketData);
      io.to('admin').emit("order:completed", socketData);
      io.emit("revenue:update", { amount: totalPrice });
    }

    console.log(`✅ Order completed: ${id}, ${formatTableDisplay(order.tableNumber)}, Total: ₹${totalPrice}`);

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

export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Find order
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

    // Update order status
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
        cancelledBy: getAdminId(req)
      },
      { new: true, runValidators: false }
    ).populate('menuItems.menuId', 'name price image category');

    // Emit socket events
    const io = req.app.get("io");
    if (io) {
      const socketData = {
        ...updatedOrder.toObject(),
        tableDisplayText: formatTableDisplay(updatedOrder.tableNumber)
      };
      
      io.to('kitchen').emit("order:cancelled", socketData);
      io.to('admin').emit("order:cancelled", socketData);
      io.emit("order:cancelled", socketData);
    }

    console.log(`❌ Order cancelled: ${id}, ${formatTableDisplay(order.tableNumber)}, Reason: ${reason || 'Not provided'}`);

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
      io.to('kitchen').emit("order:delete", { id, tableNumber: order.tableNumber });
      io.to('admin').emit("order:delete", { id, tableNumber: order.tableNumber });
      io.emit("order:delete", { id, tableNumber: order.tableNumber });
    }

    console.log(`🗑️ Order deleted: ${id}, ${formatTableDisplay(order.tableNumber)}`);

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
      io.to('kitchen').emit("order:acknowledged", { 
        id: order._id, 
        tableNumber: order.tableNumber 
      });
      io.to('admin').emit("order:acknowledged", { 
        id: order._id, 
        tableNumber: order.tableNumber 
      });
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

export const getCurrentOrders = async (req, res) => {
  try {
    const { status, tableNumber } = req.query;

    let filter = {};
    
    // Filter by status
    if (status) {
      if (status === 'all') {
        // No status filter - get all
      } else {
        filter.status = status;
      }
    } else {
      filter.status = 'preparing';
    }

    // ✅ Filter by tableNumber (works with array)
    if (tableNumber) {
      const tableNum = parseInt(tableNumber);
      if (!isNaN(tableNum)) {
        filter.tableNumber = tableNum;  // MongoDB searches in array automatically
      }
    }

    const orders = await orderModel
      .find(filter)
      .populate('menuItems.menuId', 'name price image category')
      .sort({ createdAt: -1 });

    // Add display text for tables
    const ordersWithDisplay = orders.map(order => ({
      ...order.toObject(),
      tableDisplayText: formatTableDisplay(order.tableNumber)
    }));

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders: ordersWithDisplay,
    });
  } catch (error) {
    console.error("❌ Get orders error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch orders"
    });
  }
};

export const getOrdersByTables = async (req, res) => {
  try {
    const { tables, status } = req.query;

    if (!tables) {
      return res.status(400).json({
        success: false,
        message: "Tables parameter is required (e.g., tables=4,5)"
      });
    }

    // Parse tables: "4,5" → [4, 5]
    const tableNumbers = tables
      .split(',')
      .map(t => parseInt(t.trim()))
      .filter(t => !isNaN(t));

    if (tableNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid table numbers provided"
      });
    }

    let filter = {
      tableNumber: { $in: tableNumbers }  // Orders with ANY of these tables
    };

    if (status && status !== 'all') {
      filter.status = status;
    }

    const orders = await orderModel
      .find(filter)
      .populate('menuItems.menuId', 'name price image category')
      .sort({ createdAt: -1 });

    const ordersWithDisplay = orders.map(order => ({
      ...order.toObject(),
      tableDisplayText: formatTableDisplay(order.tableNumber)
    }));

    return res.status(200).json({
      success: true,
      count: orders.length,
      searchedTables: tableNumbers,
      orders: ordersWithDisplay,
    });
  } catch (error) {
    console.error("❌ Get orders by tables error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch orders"
    });
  }
};

export const getOrdersByCombinedTables = async (req, res) => {
  try {
    const { tables, status } = req.query;

    if (!tables) {
      return res.status(400).json({
        success: false,
        message: "Tables parameter is required (e.g., tables=4,5)"
      });
    }

    // Parse tables: "4,5" → [4, 5]
    const tableNumbers = tables
      .split(',')
      .map(t => parseInt(t.trim()))
      .filter(t => !isNaN(t));

    if (tableNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid table numbers provided"
      });
    }

    let filter = {
      tableNumber: { $all: tableNumbers }  // Orders with ALL these tables
    };

    if (status && status !== 'all') {
      filter.status = status;
    }

    const orders = await orderModel
      .find(filter)
      .populate('menuItems.menuId', 'name price image category')
      .sort({ createdAt: -1 });

    const ordersWithDisplay = orders.map(order => ({
      ...order.toObject(),
      tableDisplayText: formatTableDisplay(order.tableNumber)
    }));

    return res.status(200).json({
      success: true,
      count: orders.length,
      combinedTables: tableNumbers,
      orders: ordersWithDisplay,
    });
  } catch (error) {
    console.error("❌ Get orders by combined tables error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch orders"
    });
  }
};

export const getOrdersByExactTables = async (req, res) => {
  try {
    const { tables, status } = req.query;

    if (!tables) {
      return res.status(400).json({
        success: false,
        message: "Tables parameter is required"
      });
    }

    const tableNumbers = tables
      .split(',')
      .map(t => parseInt(t.trim()))
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);

    if (tableNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid table numbers provided"
      });
    }

    let filter = {
      tableNumber: tableNumbers  // Exact match
    };

    if (status && status !== 'all') {
      filter.status = status;
    }

    const orders = await orderModel
      .find(filter)
      .populate('menuItems.menuId', 'name price image category')
      .sort({ createdAt: -1 });

    const ordersWithDisplay = orders.map(order => ({
      ...order.toObject(),
      tableDisplayText: formatTableDisplay(order.tableNumber)
    }));

    return res.status(200).json({
      success: true,
      count: orders.length,
      exactTables: tableNumbers,
      orders: ordersWithDisplay,
    });
  } catch (error) {
    console.error("❌ Get orders by exact tables error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch orders"
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
      order: {
        ...order.toObject(),
        tableDisplayText: formatTableDisplay(order.tableNumber)
      }
    });
  } catch (error) {
    console.error("❌ Get order error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch order"
    });
  }
};

export const getOrderHistory = async (req, res) => {
  try {
    const { id } = req.params;
    
    const order = await orderModel
      .findById(id)
      .select('updateHistory tableNumber status createdAt');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    return res.status(200).json({ 
      success: true,
      orderId: id,
      tableNumber: order.tableNumber,
      tableDisplayText: formatTableDisplay(order.tableNumber),
      status: order.status,
      createdAt: order.createdAt,
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

export const getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, tableNumber, startDate, endDate } = req.query;

    let filter = {};

    // Status filter
    if (status && status !== 'all') {
      filter.status = status;
    }

    // Table filter
    if (tableNumber) {
      const tableNum = parseInt(tableNumber);
      if (!isNaN(tableNum)) {
        filter.tableNumber = tableNum;
      }
    }

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      orderModel
        .find(filter)
        .populate('menuItems.menuId', 'name price image category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      orderModel.countDocuments(filter)
    ]);

    const ordersWithDisplay = orders.map(order => ({
      ...order.toObject(),
      tableDisplayText: formatTableDisplay(order.tableNumber)
    }));

    return res.status(200).json({
      success: true,
      count: orders.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      orders: ordersWithDisplay,
    });
  } catch (error) {
    console.error("❌ Get all orders error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch orders"
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
      date: today,
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
      startDate: start,
      endDate: end,
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

export const getRevenueStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // This week
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());

    // This month
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // Get all stats in parallel
    const [todayRevenue, weekRevenue, monthRevenue, totalRevenue] = await Promise.all([
      // Today
      revenueModel.findOne({ date: today }),
      // This week
      revenueModel.aggregate([
        { $match: { date: { $gte: weekStart } } },
        { $group: { _id: null, amount: { $sum: "$amount" }, orders: { $sum: "$orderCount" } } }
      ]),
      // This month
      revenueModel.aggregate([
        { $match: { date: { $gte: monthStart } } },
        { $group: { _id: null, amount: { $sum: "$amount" }, orders: { $sum: "$orderCount" } } }
      ]),
      // All time
      revenueModel.aggregate([
        { $group: { _id: null, amount: { $sum: "$amount" }, orders: { $sum: "$orderCount" } } }
      ])
    ]);

    return res.status(200).json({
      success: true,
      today: {
        revenue: todayRevenue?.amount || 0,
        orders: todayRevenue?.orderCount || 0
      },
      thisWeek: {
        revenue: weekRevenue[0]?.amount || 0,
        orders: weekRevenue[0]?.orders || 0
      },
      thisMonth: {
        revenue: monthRevenue[0]?.amount || 0,
        orders: monthRevenue[0]?.orders || 0
      },
      allTime: {
        revenue: totalRevenue[0]?.amount || 0,
        orders: totalRevenue[0]?.orders || 0
      }
    });
  } catch (error) {
    console.error("❌ Get revenue stats error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch revenue statistics"
    });
  }
};