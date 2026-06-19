import { orderModel } from "../models/order.model.js";
import { menuModel } from "../models/menu.model.js";

const validateAndCalculateTotal = async (menuItems) => {
  let totalPrice = 0;
  const validatedItems = [];

  for (const item of menuItems) {
    const menu = await menuModel.findById(item.menuId);
    if (!menu) throw new Error(`Menu item not found: ${item.menuId}`);
    if (!item.quantity || item.quantity <= 0)
      throw new Error(`Invalid quantity for ${menu.name}`);

    totalPrice += (menu.price || 0) * item.quantity;
    validatedItems.push({
      menuId: item.menuId,
      name: menu.name,
      price: menu.price,
      category: menu.category || "uncategorized",
      quantity: item.quantity,
    });
  }
  return { totalPrice, validatedItems };
};

const normalizeTableNumber = (tableNumber) => {
  if (tableNumber == null) return [];
  if (Array.isArray(tableNumber))
    return tableNumber
      .filter((t) => t != null && t !== "")
      .map(Number)
      .filter((t) => !isNaN(t))
      .sort((a, b) => a - b);
  if (typeof tableNumber === "string") {
    if (!tableNumber.trim()) return [];
    if (tableNumber.includes(","))
      return tableNumber
        .split(",")
        .map((t) => parseInt(t.trim()))
        .filter((t) => !isNaN(t))
        .sort((a, b) => a - b);
    const n = parseInt(tableNumber.trim());
    return isNaN(n) ? [] : [n];
  }
  if (typeof tableNumber === "number") return isNaN(tableNumber) ? [] : [tableNumber];
  return [];
};

const formatTableDisplay = (tableNumbers) => {
  if (!tableNumbers || tableNumbers.length === 0) return "No Table";
  if (tableNumbers.length === 1) return `Table ${tableNumbers[0]}`;
  return `Tables ${tableNumbers.join(", ")}`;
};

const getCreatorName = (req) => {
  if (req.employee) return req.employee.name || req.employee.email;
  return "admin";
};

const emitToAll = (io, event, data) => {
  io.to("kitchen").emit(event, data);
  io.to("admin").emit(event, data);
  io.to("waiter").emit(event, data);
  io.emit(event, data);
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

  const oldItemsMap = new Map();
  oldOrder.menuItems.forEach(item => {
    const menuId = item.menuId?._id
      ? item.menuId._id.toString()
      : item.menuId.toString();
    oldItemsMap.set(menuId, {
      quantity: item.quantity,
      name: item.menuId?.name || item.name || 'Unknown',
      category: item.menuId?.menuCategory || item.category || 'uncategorized'
    });
  });

  const newItemsMap = new Map();
  newMenuItems.forEach(item => {
    newItemsMap.set(item.menuId.toString(), {
      quantity: item.quantity,
      name: item.name,
      category: item.category || 'uncategorized'
    });
  });

  newItemsMap.forEach((newItem, menuId) => {
    if (!oldItemsMap.has(menuId)) {
      changes.newItems.push({ menuId, name: newItem.name, category: newItem.category, quantity: newItem.quantity });
      changes.added.push({ menuId, name: newItem.name, category: newItem.category, quantity: newItem.quantity });
    }
  });

  oldItemsMap.forEach((oldItem, menuId) => {
    if (!newItemsMap.has(menuId)) {
      changes.removedItems.push({ menuId, name: oldItem.name, category: oldItem.category, quantity: oldItem.quantity });
      changes.removed.push({ menuId, name: oldItem.name, category: oldItem.category, quantity: oldItem.quantity });
    }
  });

  newItemsMap.forEach((newItem, menuId) => {
    const oldItem = oldItemsMap.get(menuId);
    if (oldItem && oldItem.quantity !== newItem.quantity) {
      const type = newItem.quantity > oldItem.quantity ? 'increased' : 'decreased';
      changes.updatedItems.push({
        menuId, name: newItem.name, category: newItem.category,
        oldQuantity: oldItem.quantity, newQuantity: newItem.quantity,
        change: newItem.quantity - oldItem.quantity, type
      });
      changes.updated.push({
        menuId, name: newItem.name, category: newItem.category,
        oldQuantity: oldItem.quantity, newQuantity: newItem.quantity,
        change: newItem.quantity - oldItem.quantity,
      });
    }
  });

  return changes;
};

// GET /api/waiter/orders
export const waiterGetOrders = async (req, res) => {
  try {
    const orders = await orderModel
      .find({ status: "preparing" })
      .populate("menuItems.menuId", "name price image menuCategory")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders: orders.map((o) => ({
        ...o.toObject(),
        tableDisplayText: formatTableDisplay(o.tableNumber),
      })),
    });
  } catch (error) {
    console.error("waiterGetOrders error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
};

// GET /api/waiter/menu
export const waiterGetMenu = async (req, res) => {
  try {
    const menus = await menuModel.find().sort({ priority: -1, date: -1 });
    return res.status(200).json({ success: true, count: menus.length, menus });
  } catch (error) {
    console.error("waiterGetMenu error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch menu" });
  }
};

// POST /api/waiter/orders/create
export const waiterCreateOrder = async (req, res) => {
  try {
    const { menuItems, tableNumber } = req.body;

    if (!menuItems || menuItems.length === 0) {
      return res.status(400).json({ success: false, message: "Menu items are required" });
    }

    const { totalPrice, validatedItems } = await validateAndCalculateTotal(menuItems);
    const normalizedTableNumber = normalizeTableNumber(tableNumber);

    const order = new orderModel({
      menuItems: validatedItems,
      totalPrice,
      tableNumber: normalizedTableNumber,
      createdBy: getCreatorName(req),
      status: "preparing",
      updatedItems: [],
      newItems: [],
      removedItems: [],
      lastUpdatedAt: null,
      updateHistory: [],
    });

    await order.save();
    await order.populate("menuItems.menuId", "name price image menuCategory");

    const io = req.app.get("io");
    if (io) {
      const socketData = {
        ...order.toObject(),
        tableDisplayText: formatTableDisplay(order.tableNumber),
      };
      io.to("kitchen").emit("order:new", socketData);
      io.to("admin").emit("order:new", socketData);
      io.to("waiter").emit("order:new", socketData);
      io.emit("order:new", socketData);

      console.log(`📡 Emitted order:new - Order: ${order._id}, Table: ${formatTableDisplay(normalizedTableNumber)}`);
    }

    console.log(`✅ Waiter order created: ${order._id}, ${formatTableDisplay(normalizedTableNumber)}, Total: ₹${totalPrice}`);

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      order: {
        ...order.toObject(),
        tableDisplayText: formatTableDisplay(order.tableNumber),
      },
    });
  } catch (error) {
    console.error("waiterCreateOrder error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to create order" });
  }
};

// PUT /api/waiter/orders/:id
export const waiterUpdateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { menuItems, tableNumber } = req.body;

    const order = await orderModel
      .findById(id)
      .populate("menuItems.menuId", "name price image menuCategory");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status !== "preparing") {
      return res.status(400).json({
        success: false,
        message: `Cannot edit an order that is already ${order.status}`,
      });
    }

    let updateData = {};
    let changes = null;

    if (menuItems !== undefined) {
      if (menuItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Order must have at least one item",
        });
      }

      const { totalPrice, validatedItems } = await validateAndCalculateTotal(menuItems);
      changes = findOrderChanges(order, validatedItems);

      updateData.menuItems = validatedItems;
      updateData.totalPrice = totalPrice;
      updateData.newItems = changes.newItems;
      updateData.updatedItems = changes.updatedItems.map(item => ({
        menuId: item.menuId,
        name: item.name,
        category: item.category,
        oldQuantity: item.oldQuantity,
        newQuantity: item.newQuantity,
        change: item.change,
        type: item.type,
      }));
      updateData.removedItems = changes.removedItems;

      if (
        changes.newItems.length > 0 ||
        changes.removedItems.length > 0 ||
        changes.updatedItems.length > 0
      ) {
        updateData.lastUpdatedAt = new Date();
        updateData.$push = {
          updateHistory: {
            updatedAt: new Date(),
            updatedBy: getCreatorName(req),
            changes: {
              added: changes.added,
              removed: changes.removed,
              updated: changes.updated
            },
          },
        };
      }
    }

    if (tableNumber !== undefined) {
      updateData.tableNumber = normalizeTableNumber(tableNumber);
    }

    const updatedOrder = await orderModel
      .findByIdAndUpdate(id, updateData, { new: true, runValidators: false })
      .populate("menuItems.menuId", "name price image menuCategory");

    const io = req.app.get("io");
    if (io) {
      const socketData = {
        ...updatedOrder.toObject(),
        updatedItems: updatedOrder.updatedItems,
        newItems: updatedOrder.newItems,
        removedItems: updatedOrder.removedItems,
        tableDisplayText: formatTableDisplay(updatedOrder.tableNumber),
      };

      io.to("kitchen").emit("order:update", socketData);
      io.to("admin").emit("order:update", socketData);
      io.to("waiter").emit("order:update", socketData);
      io.emit("order:update", socketData);

      if (changes) {
        if (changes.newItems.length > 0)
          io.to('kitchen').emit("order:items-added", {
            orderId: id,
            items: changes.added,
            tableNumber: updatedOrder.tableNumber
          });
        if (changes.removedItems.length > 0)
          io.to('kitchen').emit("order:items-removed", {
            orderId: id,
            items: changes.removed,
            tableNumber: updatedOrder.tableNumber
          });
        if (changes.updatedItems.length > 0)
          io.to('kitchen').emit("order:items-updated", {
            orderId: id,
            items: changes.updated,
            tableNumber: updatedOrder.tableNumber
          });
      }
    }

    console.log(`✅ Waiter order updated: ${id}, ${formatTableDisplay(updatedOrder.tableNumber)}`);
    console.log(`📊 Changes - Added: ${changes?.newItems.length || 0}, Removed: ${changes?.removedItems.length || 0}, Updated: ${changes?.updatedItems.length || 0}`);

    return res.status(200).json({
      success: true,
      message: "Order updated successfully",
      order: {
        ...updatedOrder.toObject(),
        tableDisplayText: formatTableDisplay(updatedOrder.tableNumber),
      },
      changes: changes ? {
        itemsAdded: changes.added,
        itemsRemoved: changes.removed,
        itemsUpdated: changes.updated
      } : null,
    });
  } catch (error) {
    console.error("waiterUpdateOrder error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to update order" });
  }
};

// GET /api/waiter/orders/:id
export const waiterGetOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await orderModel
      .findById(id)
      .populate("menuItems.menuId", "name price image menuCategory");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    return res.status(200).json({
      success: true,
      order: {
        ...order.toObject(),
        tableDisplayText: formatTableDisplay(order.tableNumber),
      },
    });
  } catch (error) {
    console.error("waiterGetOrderById error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch order" });
  }
};

// ✅ DELETE /api/waiter/orders/:id
export const waiterDeleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await orderModel.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // ✅ Only allow delete if still preparing
    if (order.status !== "preparing") {
      return res.status(400).json({
        success: false,
        message: "Only preparing orders can be deleted",
      });
    }

    await orderModel.findByIdAndDelete(id);

    // ✅ Emit socket update
    const io = req.app.get("io");
    if (io) {
      io.to("kitchen").emit("order:delete", { id });
      io.to("admin").emit("order:delete", { id });
      io.to("waiter").emit("order:delete", { id });
      io.emit("order:delete", { id });
    }

    console.log(`✅ Waiter deleted order: ${id}`);

    return res.status(200).json({
      success: true,
      message: "Order deleted successfully",
    });

  } catch (error) {
    console.error("waiterDeleteOrder error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete order",
    });
  }
};