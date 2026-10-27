import { orderModel } from "../models/order.model.js";
import { menuModel } from "../models/menu.model.js";
import {
  emitToAll,
  findOrderChanges,
  formatTableDisplay,
  normalizeTableNumber,
  validateAndCalculateTotal,
} from "../utils/orderHelpers.js";

const getCreatorName = (req) => {
  if (req.employee) return req.employee.name || req.employee.email;
  return "admin";
};

// GET /api/waiter/orders
export const waiterGetOrders = async (req, res) => {
  try {
    const orders = await orderModel
      .find({ status: "preparing" })
      .populate("menuItems.menuId", "name price category")
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
    await order.populate("menuItems.menuId", "name price category");

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
      .populate("menuItems.menuId", "name price category");

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
      .populate("menuItems.menuId", "name price category");

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
      .populate("menuItems.menuId", "name price category");

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