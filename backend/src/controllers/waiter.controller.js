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

// GET /api/waiter/orders — all preparing orders across all tables
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

// GET /api/waiter/orders/menu — get full menu so waiter can pick items
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
    if (io) emitToAll(io, "order:new", order);

    console.log(`✅ Waiter order created: ${order._id}, ${formatTableDisplay(normalizedTableNumber)}, Total: ₹${totalPrice}`);

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      order,
    });
  } catch (error) {
    console.error("waiterCreateOrder error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to create order" });
  }
};

// PUT /api/waiter/orders/:id — edit items or table only, cannot complete or cancel
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

    if (menuItems !== undefined) {
      if (menuItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Order must have at least one item",
        });
      }

      const { totalPrice, validatedItems } = await validateAndCalculateTotal(menuItems);
      updateData.menuItems = validatedItems;
      updateData.totalPrice = totalPrice;
      updateData.lastUpdatedAt = new Date();
      updateData.$push = {
        updateHistory: {
          updatedAt: new Date(),
          updatedBy: getCreatorName(req),
          changes: { added: [], removed: [], updated: [] },
        },
      };
    }

    if (tableNumber !== undefined) {
      updateData.tableNumber = normalizeTableNumber(tableNumber);
    }

    const updatedOrder = await orderModel
      .findByIdAndUpdate(id, updateData, { new: true, runValidators: false })
      .populate("menuItems.menuId", "name price image menuCategory");

    const io = req.app.get("io");
    if (io) emitToAll(io, "order:update", {
      ...updatedOrder.toObject(),
      tableDisplayText: formatTableDisplay(updatedOrder.tableNumber),
    });

    console.log(`✅ Waiter order updated: ${id}, ${formatTableDisplay(updatedOrder.tableNumber)}`);

    return res.status(200).json({
      success: true,
      message: "Order updated successfully",
      order: {
        ...updatedOrder.toObject(),
        tableDisplayText: formatTableDisplay(updatedOrder.tableNumber),
      },
    });
  } catch (error) {
    console.error("waiterUpdateOrder error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to update order" });
  }
};

// GET /api/waiter/orders/:id — get single order
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