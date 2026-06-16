import { orderModel, revenueByCategoryModel } from "../models/order.model.js";
import { menuModel } from "../models/menu.model.js";
import { revenueModel } from "../models/revenue.model.js";

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
            category: menu.category || 'uncategorized',
            quantity: item.quantity
        });
    }
    return { totalPrice, validatedItems };
};

const normalizeTableNumber = (tableNumber) => {
    if (tableNumber === null || tableNumber === undefined) return [];
    if (Array.isArray(tableNumber))
        return tableNumber
            .filter(t => t !== null && t !== undefined && t !== '')
            .map(t => parseInt(t))
            .filter(t => !isNaN(t))
            .sort((a, b) => a - b);
    if (typeof tableNumber === 'string') {
        if (tableNumber.trim() === '') return [];
        if (tableNumber.includes(','))
            return tableNumber.split(',').map(t => parseInt(t.trim())).filter(t => !isNaN(t)).sort((a, b) => a - b);
        const num = parseInt(tableNumber.trim());
        return isNaN(num) ? [] : [num];
    }
    if (typeof tableNumber === 'number') return isNaN(tableNumber) ? [] : [tableNumber];
    return [];
};

const formatTableDisplay = (tableNumbers) => {
    if (!tableNumbers || tableNumbers.length === 0) return 'No Table';
    if (tableNumbers.length === 1) return `Table ${tableNumbers[0]}`;
    return `Tables ${tableNumbers.join(', ')}`;
};

const formatCategoryName = (category) => {
    if (!category || category === 'uncategorized') return 'Uncategorized';
    return category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const findOrderChanges = (oldOrder, newMenuItems) => {
    const changes = { newItems: [], removedItems: [], updatedItems: [], added: [], removed: [], updated: [] };

    const oldItemsMap = new Map();
    oldOrder.menuItems.forEach(item => {
        const menuId = item.menuId._id ? item.menuId._id.toString() : item.menuId.toString();
        oldItemsMap.set(menuId, {
            quantity: item.quantity,
            name: item.menuId.name || item.name || 'Unknown',
            category: item.menuId.menuCategory || item.category || 'uncategorized'
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
            changes.updatedItems.push({ menuId, name: newItem.name, category: newItem.category, oldQuantity: oldItem.quantity, newQuantity: newItem.quantity, type });
            changes.updated.push({ menuId, name: newItem.name, category: newItem.category, oldQuantity: oldItem.quantity, newQuantity: newItem.quantity });
        }
    });

    return changes;
};

const getAdminId = (req) => {
    if (req.admin) {
        if (req.admin._id) return req.admin._id.toString();
        if (req.admin.id) return req.admin.id.toString();
        if (req.admin.name) return req.admin.name;
    }
    return 'admin';
};

// helper: emit order events to all relevant rooms
const emitToAll = (io, event, data) => {
    io.to('kitchen').emit(event, data);
    io.to('admin').emit(event, data);
    io.to('waiter').emit(event, data);
    io.emit(event, data);
};

export const createOrder = async (req, res) => {
    try {
        const { menuItems, tableNumber } = req.body;
        if (!menuItems || menuItems.length === 0)
            return res.status(400).json({ success: false, message: "Menu items are required" });

        const { totalPrice, validatedItems } = await validateAndCalculateTotal(menuItems);
        const normalizedTableNumber = normalizeTableNumber(tableNumber);

        const order = new orderModel({
            menuItems: validatedItems.map(item => ({
                menuId: item.menuId, name: item.name, price: item.price,
                category: item.category, quantity: item.quantity
            })),
            totalPrice,
            tableNumber: normalizedTableNumber,
            createdBy: getAdminId(req),
            status: 'preparing',
            updatedItems: [], newItems: [], removedItems: [],
            lastUpdatedAt: null, updateHistory: []
        });

        await order.save();
        await order.populate('menuItems.menuId', 'name price image menuCategory');

        const io = req.app.get("io");
        if (io) emitToAll(io, "order:new", order);

        return res.status(201).json({ success: true, message: "Order created successfully", order });
    } catch (error) {
        console.error("❌ Create order error:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to create order" });
    }
};

export const updateOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { menuItems, tableNumber, status } = req.body;

        const order = await orderModel.findById(id).populate('menuItems.menuId', 'name price image menuCategory');
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        if (order.status === 'completed') return res.status(400).json({ success: false, message: "Cannot update completed order" });

        let updateData = {};
        let changes = null;
        let totalPrice = order.totalPrice;

        if (menuItems && menuItems.length >= 0) {
            if (menuItems.length === 0)
                return res.status(400).json({ success: false, message: "Order must have at least one item." });

            const { totalPrice: newTotal, validatedItems } = await validateAndCalculateTotal(menuItems);
            totalPrice = newTotal;
            changes = findOrderChanges(order, validatedItems);

            updateData.menuItems = validatedItems.map(item => ({
                menuId: item.menuId, name: item.name, price: item.price,
                category: item.category, quantity: item.quantity
            }));
            updateData.totalPrice = totalPrice;
            updateData.updatedItems = changes.updatedItems.map(item => ({
                menuId: item.menuId, name: item.name, category: item.category,
                oldQuantity: item.oldQuantity, newQuantity: item.newQuantity, type: item.type
            }));
            updateData.newItems = changes.newItems;
            updateData.removedItems = changes.removedItems;

            if (changes.newItems.length > 0 || changes.removedItems.length > 0 || changes.updatedItems.length > 0) {
                updateData.lastUpdatedAt = new Date();
                updateData.$push = {
                    updateHistory: {
                        updatedAt: new Date(), updatedBy: getAdminId(req),
                        changes: { added: changes.added, removed: changes.removed, updated: changes.updated }
                    }
                };
            }
        }

        if (tableNumber !== undefined) updateData.tableNumber = normalizeTableNumber(tableNumber);

        if (status) {
            if (!['preparing', 'completed', 'cancelled'].includes(status))
                return res.status(400).json({ success: false, message: "Invalid status." });
            updateData.status = status;
            if (status === 'completed' || status === 'cancelled') {
                updateData.updatedItems = [];
                updateData.newItems = [];
                updateData.removedItems = [];
            }
        }

        const updatedOrder = await orderModel
            .findByIdAndUpdate(id, updateData, { new: true, runValidators: false })
            .populate('menuItems.menuId', 'name price image menuCategory');

        const io = req.app.get("io");
        if (io) {
            const socketData = {
                ...updatedOrder.toObject(),
                updatedItems: updatedOrder.updatedItems,
                newItems: updatedOrder.newItems,
                removedItems: updatedOrder.removedItems,
                tableDisplayText: formatTableDisplay(updatedOrder.tableNumber)
            };
            emitToAll(io, "order:update", socketData);

            if (changes) {
                if (changes.newItems.length > 0)
                    io.to('kitchen').emit("order:items-added", { orderId: id, items: changes.added, tableNumber: updatedOrder.tableNumber });
                if (changes.removedItems.length > 0)
                    io.to('kitchen').emit("order:items-removed", { orderId: id, items: changes.removed, tableNumber: updatedOrder.tableNumber });
                if (changes.updatedItems.length > 0)
                    io.to('kitchen').emit("order:items-updated", { orderId: id, items: changes.updated, tableNumber: updatedOrder.tableNumber });
            }
        }

        return res.status(200).json({
            success: true, message: "Order updated successfully", order: updatedOrder,
            changes: changes ? { itemsAdded: changes.added, itemsRemoved: changes.removed, itemsUpdated: changes.updated } : null
        });
    } catch (error) {
        console.error("❌ Update order error:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to update order" });
    }
};

export const completeOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { completionDate } = req.body;

        const order = await orderModel.findById(id).populate('menuItems.menuId', 'name price image menuCategory');
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        if (order.status === 'completed') return res.status(400).json({ success: false, message: "Order is already completed" });
        if (order.status === 'cancelled') return res.status(400).json({ success: false, message: "Cannot complete a cancelled order" });

        const totalPrice = order.totalPrice;

        let revenueDate;
        if (completionDate) {
            revenueDate = new Date(completionDate + 'T00:00:00');
        } else {
            revenueDate = new Date();
            revenueDate.setHours(0, 0, 0, 0);
        }

        const expiresAt = new Date(revenueDate);
        expiresAt.setDate(expiresAt.getDate() + 1);
        expiresAt.setHours(0, 0, 0, 0);

        const deleteTime = new Date();
        deleteTime.setDate(deleteTime.getDate() + 1);
        deleteTime.setHours(0, 0, 0, 0);

        const now = new Date();
        const hoursUntilDeletion = Math.round((deleteTime - now) / (1000 * 60 * 60));

        const updatedOrder = await orderModel.findByIdAndUpdate(
            id,
            {
                status: 'completed',
                updatedItems: [], newItems: [], removedItems: [],
                lastUpdatedAt: null,
                completedAt: new Date(),
                completedBy: getAdminId(req),
                deleteAt: deleteTime
            },
            { new: true, runValidators: false }
        ).populate('menuItems.menuId', 'name price image menuCategory');

        await revenueModel.findOneAndUpdate(
            { date: revenueDate },
            { $inc: { amount: totalPrice, orderCount: 1 } },
            { upsert: true, new: true }
        );

        const categoryRevenues = {};
        for (const item of order.menuItems) {
            const category = item.menuId?.menuCategory || item.category || 'uncategorized';
            const itemPrice = item.menuId?.price || item.price || 0;
            const itemRevenue = itemPrice * item.quantity;
            if (!categoryRevenues[category]) categoryRevenues[category] = { revenue: 0, quantity: 0 };
            categoryRevenues[category].revenue += itemRevenue;
            categoryRevenues[category].quantity += item.quantity;
        }

        for (const [category, data] of Object.entries(categoryRevenues)) {
            await revenueByCategoryModel.findOneAndUpdate(
                { date: revenueDate, category },
                {
                    $inc: { totalRevenue: data.revenue, totalQuantity: data.quantity, orderCount: 1 },
                    $set: { categoryName: formatCategoryName(category), expiresAt }
                },
                { upsert: true, new: true }
            );
        }

        const io = req.app.get("io");
        if (io) {
            const socketData = {
                ...updatedOrder.toObject(),
                tableDisplayText: formatTableDisplay(updatedOrder.tableNumber)
            };
            emitToAll(io, "order:completed", socketData);
            emitToAll(io, "revenue:update", { amount: totalPrice, date: revenueDate, categoryRevenues });
        }

        return res.status(200).json({
            success: true,
            message: `Order completed. Will be deleted at midnight (${deleteTime.toLocaleTimeString()})`,
            order: updatedOrder,
            willDeleteAt: deleteTime,
            deleteAtMidnight: true,
            hoursUntilDeletion
        });
    } catch (error) {
        console.error("❌ Complete order error:", error);
        return res.status(500).json({ success: false, message: "Failed to complete order" });
    }
};

export const cancelOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const order = await orderModel.findById(id).populate('menuItems.menuId', 'name price image menuCategory');
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        if (order.status === 'completed') return res.status(400).json({ success: false, message: "Cannot cancel completed order" });
        if (order.status === 'cancelled') return res.status(400).json({ success: false, message: "Order is already cancelled" });

        const updatedOrder = await orderModel.findByIdAndUpdate(
            id,
            {
                status: 'cancelled',
                updatedItems: [], newItems: [], removedItems: [],
                lastUpdatedAt: null,
                cancellationReason: reason || 'No reason provided',
                cancelledAt: new Date(),
                cancelledBy: getAdminId(req)
            },
            { new: true, runValidators: false }
        ).populate('menuItems.menuId', 'name price image menuCategory');

        const io = req.app.get("io");
        if (io) {
            const socketData = {
                ...updatedOrder.toObject(),
                tableDisplayText: formatTableDisplay(updatedOrder.tableNumber)
            };
            emitToAll(io, "order:cancelled", socketData);
        }

        return res.status(200).json({ success: true, message: "Order cancelled successfully", order: updatedOrder });
    } catch (error) {
        console.error("❌ Cancel order error:", error);
        return res.status(500).json({ success: false, message: "Failed to cancel order" });
    }
};

export const deleteOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await orderModel.findById(id);
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        if (order.status === 'completed')
            return res.status(400).json({ success: false, message: "Cannot delete completed orders. Revenue already recorded." });

        await orderModel.findByIdAndDelete(id);

        const io = req.app.get("io");
        if (io) emitToAll(io, "order:delete", { id, tableNumber: order.tableNumber });

        return res.status(200).json({ success: true, message: "Order deleted successfully" });
    } catch (error) {
        console.error("❌ Delete order error:", error);
        return res.status(500).json({ success: false, message: "Failed to delete order" });
    }
};

export const acknowledgeOrderUpdate = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await orderModel.findById(id);
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        const updatedOrder = await orderModel.findByIdAndUpdate(
            id,
            { updatedItems: [], newItems: [], removedItems: [], lastUpdatedAt: null },
            { new: true, runValidators: false }
        ).populate('menuItems.menuId', 'name price image menuCategory');

        const io = req.app.get("io");
        if (io) {
            io.to('kitchen').emit("order:acknowledged", { id: order._id, tableNumber: order.tableNumber });
            io.to('admin').emit("order:acknowledged", { id: order._id, tableNumber: order.tableNumber });
            io.to('waiter').emit("order:acknowledged", { id: order._id, tableNumber: order.tableNumber });
        }

        return res.status(200).json({ success: true, message: "Update acknowledged", order: updatedOrder });
    } catch (error) {
        console.error("❌ Acknowledge error:", error);
        return res.status(500).json({ success: false, message: "Failed to acknowledge update" });
    }
};

export const getCurrentOrders = async (req, res) => {
    try {
        const { status, tableNumber } = req.query;
        let filter = {};
        if (status) { if (status !== 'all') filter.status = status; } 
        else { filter.status = 'preparing'; }
        if (tableNumber) {
            const tableNum = parseInt(tableNumber);
            if (!isNaN(tableNum)) filter.tableNumber = tableNum;
        }

        const orders = await orderModel
            .find(filter)
            .populate('menuItems.menuId', 'name price image menuCategory')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true, count: orders.length,
            orders: orders.map(order => ({ ...order.toObject(), tableDisplayText: formatTableDisplay(order.tableNumber) }))
        });
    } catch (error) {
        console.error("❌ Get orders error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch orders" });
    }
};

export const getOrdersByTables = async (req, res) => {
    try {
        const { tables, status } = req.query;
        if (!tables) return res.status(400).json({ success: false, message: "Tables parameter is required" });

        const tableNumbers = tables.split(',').map(t => parseInt(t.trim())).filter(t => !isNaN(t));
        if (tableNumbers.length === 0) return res.status(400).json({ success: false, message: "Invalid table numbers" });

        let filter = { tableNumber: { $in: tableNumbers } };
        if (status && status !== 'all') filter.status = status;

        const orders = await orderModel.find(filter).populate('menuItems.menuId', 'name price image menuCategory').sort({ createdAt: -1 });
        return res.status(200).json({
            success: true, count: orders.length, searchedTables: tableNumbers,
            orders: orders.map(o => ({ ...o.toObject(), tableDisplayText: formatTableDisplay(o.tableNumber) }))
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch orders" });
    }
};

export const getOrdersByCombinedTables = async (req, res) => {
    try {
        const { tables, status } = req.query;
        if (!tables) return res.status(400).json({ success: false, message: "Tables parameter is required" });

        const tableNumbers = tables.split(',').map(t => parseInt(t.trim())).filter(t => !isNaN(t));
        if (tableNumbers.length === 0) return res.status(400).json({ success: false, message: "Invalid table numbers" });

        let filter = { tableNumber: { $all: tableNumbers } };
        if (status && status !== 'all') filter.status = status;

        const orders = await orderModel.find(filter).populate('menuItems.menuId', 'name price image menuCategory').sort({ createdAt: -1 });
        return res.status(200).json({
            success: true, count: orders.length, combinedTables: tableNumbers,
            orders: orders.map(o => ({ ...o.toObject(), tableDisplayText: formatTableDisplay(o.tableNumber) }))
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch orders" });
    }
};

export const getOrdersByExactTables = async (req, res) => {
    try {
        const { tables, status } = req.query;
        if (!tables) return res.status(400).json({ success: false, message: "Tables parameter is required" });

        const tableNumbers = tables.split(',').map(t => parseInt(t.trim())).filter(t => !isNaN(t)).sort((a, b) => a - b);
        if (tableNumbers.length === 0) return res.status(400).json({ success: false, message: "Invalid table numbers" });

        let filter = { tableNumber: tableNumbers };
        if (status && status !== 'all') filter.status = status;

        const orders = await orderModel.find(filter).populate('menuItems.menuId', 'name price image menuCategory').sort({ createdAt: -1 });
        return res.status(200).json({
            success: true, count: orders.length, exactTables: tableNumbers,
            orders: orders.map(o => ({ ...o.toObject(), tableDisplayText: formatTableDisplay(o.tableNumber) }))
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch orders" });
    }
};

export const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await orderModel.findById(id).populate('menuItems.menuId', 'name price image menuCategory');
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        return res.status(200).json({
            success: true,
            order: { ...order.toObject(), tableDisplayText: formatTableDisplay(order.tableNumber) }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch order" });
    }
};

export const getOrderHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await orderModel.findById(id).select('updateHistory tableNumber status createdAt');
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        return res.status(200).json({
            success: true, orderId: id,
            tableNumber: order.tableNumber,
            tableDisplayText: formatTableDisplay(order.tableNumber),
            status: order.status, createdAt: order.createdAt, history: order.updateHistory
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch order history" });
    }
};

export const getAllOrders = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, tableNumber, startDate, endDate } = req.query;
        let filter = {};
        if (status && status !== 'all') filter.status = status;
        if (tableNumber) { const n = parseInt(tableNumber); if (!isNaN(n)) filter.tableNumber = n; }
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); filter.createdAt.$lte = end; }
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [orders, total] = await Promise.all([
            orderModel.find(filter).populate('menuItems.menuId', 'name price image menuCategory').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            orderModel.countDocuments(filter)
        ]);
        return res.status(200).json({
            success: true, count: orders.length, total, page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            orders: orders.map(o => ({ ...o.toObject(), tableDisplayText: formatTableDisplay(o.tableNumber) }))
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch orders" });
    }
};

export const getTodayRevenue = async (req, res) => {
    try {
        const { date } = req.query;
        let today = date ? new Date(date + 'T00:00:00') : new Date();
        if (!date) today.setHours(0, 0, 0, 0);
        const revenue = await revenueModel.findOne({ date: today });
        return res.status(200).json({ success: true, date: today, revenue: revenue ? revenue.amount : 0, orderCount: revenue ? revenue.orderCount : 0 });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch today's revenue" });
    }
};

export const getTotalRevenue = async (req, res) => {
    try {
        const result = await revenueModel.aggregate([{ $group: { _id: null, totalRevenue: { $sum: "$amount" }, totalOrders: { $sum: "$orderCount" } } }]);
        return res.status(200).json({ success: true, totalRevenue: result[0]?.totalRevenue || 0, totalOrders: result[0]?.totalOrders || 0 });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch total revenue" });
    }
};

export const getRevenueByDateRange = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ success: false, message: "Start date and end date are required" });
        const start = new Date(startDate); start.setHours(0, 0, 0, 0);
        const end = new Date(endDate); end.setHours(23, 59, 59, 999);
        const revenues = await revenueModel.find({ date: { $gte: start, $lte: end } }).sort({ date: -1 });
        return res.status(200).json({
            success: true, startDate: start, endDate: end,
            totalRevenue: revenues.reduce((s, r) => s + r.amount, 0),
            totalOrders: revenues.reduce((s, r) => s + r.orderCount, 0),
            dailyRevenues: revenues
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch revenue data" });
    }
};

export const getRevenueStats = async (req, res) => {
    try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const [todayRevenue, weekRevenue, monthRevenue, totalRevenue] = await Promise.all([
            revenueModel.findOne({ date: today }),
            revenueModel.aggregate([{ $match: { date: { $gte: weekStart } } }, { $group: { _id: null, amount: { $sum: "$amount" }, orders: { $sum: "$orderCount" } } }]),
            revenueModel.aggregate([{ $match: { date: { $gte: monthStart } } }, { $group: { _id: null, amount: { $sum: "$amount" }, orders: { $sum: "$orderCount" } } }]),
            revenueModel.aggregate([{ $group: { _id: null, amount: { $sum: "$amount" }, orders: { $sum: "$orderCount" } } }])
        ]);
        return res.status(200).json({
            success: true,
            today: { revenue: todayRevenue?.amount || 0, orders: todayRevenue?.orderCount || 0 },
            thisWeek: { revenue: weekRevenue[0]?.amount || 0, orders: weekRevenue[0]?.orders || 0 },
            thisMonth: { revenue: monthRevenue[0]?.amount || 0, orders: monthRevenue[0]?.orders || 0 },
            allTime: { revenue: totalRevenue[0]?.amount || 0, orders: totalRevenue[0]?.orders || 0 }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch revenue statistics" });
    }
};

export const getTodayRevenueByCategory = async (req, res) => {
    try {
        const { date } = req.query;
        let targetDate = date ? new Date(date + 'T00:00:00') : new Date();
        if (!date) targetDate.setHours(0, 0, 0, 0);
        const nextDate = new Date(targetDate); nextDate.setDate(nextDate.getDate() + 1);

        const stats = await orderModel.aggregate([
            { $match: { status: 'completed', completedAt: { $gte: targetDate, $lt: nextDate } } },
            { $unwind: '$menuItems' },
            { $group: {
                _id: { $ifNull: ['$menuItems.category', 'uncategorized'] },
                totalRevenue: { $sum: { $multiply: [{ $ifNull: ['$menuItems.price', 0] }, { $ifNull: ['$menuItems.quantity', 0] }] } },
                totalQuantity: { $sum: { $ifNull: ['$menuItems.quantity', 0] } },
                orderIds: { $addToSet: '$_id' },
                itemDetails: { $push: { name: '$menuItems.name', price: { $ifNull: ['$menuItems.price', 0] }, quantity: { $ifNull: ['$menuItems.quantity', 0] } } }
            }},
            { $project: { _id: 0, category: '$_id', totalRevenue: 1, totalQuantity: 1, orderCount: { $size: '$orderIds' }, itemDetails: 1 } },
            { $sort: { totalRevenue: -1 } }
        ]);

        const processedStats = stats.map(cat => {
            const itemMap = new Map();
            cat.itemDetails.forEach(item => {
                const key = item.name || 'Unknown Item';
                if (itemMap.has(key)) { itemMap.get(key).quantity += item.quantity; }
                else { itemMap.set(key, { name: item.name || 'Unknown Item', price: item.price, quantity: item.quantity }); }
            });
            return {
                category: cat.category, categoryName: formatCategoryName(cat.category),
                totalRevenue: cat.totalRevenue, totalQuantity: cat.totalQuantity, orderCount: cat.orderCount,
                items: Array.from(itemMap.values()).sort((a, b) => b.quantity - a.quantity)
            };
        });

        const totalRevenue = processedStats.reduce((s, c) => s + c.totalRevenue, 0);
        const totalQuantity = processedStats.reduce((s, c) => s + c.totalQuantity, 0);
        const totalOrders = processedStats.reduce((s, c) => s + c.orderCount, 0);

        return res.status(200).json({
            success: true, date: targetDate, totalRevenue, totalQuantity, totalOrders,
            categoryCount: processedStats.length,
            categories: processedStats.map(c => ({ ...c, percentage: totalRevenue > 0 ? Math.round((c.totalRevenue / totalRevenue) * 100) : 0 }))
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch today's revenue by category" });
    }
};

export const getRevenueByCategory = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let matchStage = { status: 'completed' };
        if (startDate || endDate) {
            matchStage.completedAt = {};
            if (startDate) matchStage.completedAt.$gte = new Date(startDate + 'T00:00:00');
            if (endDate) matchStage.completedAt.$lte = new Date(endDate + 'T23:59:59.999');
        }

        const stats = await orderModel.aggregate([
            { $match: matchStage }, { $unwind: '$menuItems' },
            { $group: {
                _id: { $ifNull: ['$menuItems.category', 'uncategorized'] },
                totalRevenue: { $sum: { $multiply: [{ $ifNull: ['$menuItems.price', 0] }, { $ifNull: ['$menuItems.quantity', 0] }] } },
                totalQuantity: { $sum: { $ifNull: ['$menuItems.quantity', 0] } },
                orderIds: { $addToSet: '$_id' }
            }},
            { $project: { _id: 0, category: '$_id', totalRevenue: 1, totalQuantity: 1, orderCount: { $size: '$orderIds' } } },
            { $sort: { totalRevenue: -1 } }
        ]);

        const totalRevenue = stats.reduce((s, c) => s + c.totalRevenue, 0);
        return res.status(200).json({
            success: true, totalRevenue, totalQuantity: stats.reduce((s, c) => s + c.totalQuantity, 0),
            categoryCount: stats.length,
            categories: stats.map(c => ({ ...c, categoryName: formatCategoryName(c.category), percentage: totalRevenue > 0 ? Math.round((c.totalRevenue / totalRevenue) * 100) : 0 }))
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch revenue by category" });
    }
};

export const debugMenuCategories = async (req, res) => {
    try {
        const menus = await menuModel.find({}, "name menuCategory");
        return res.status(200).json({
            success: true, count: menus.length,
            menus: menus.map(m => ({ id: m._id, name: m.name, menuCategory: m.menuCategory || 'NOT SET' }))
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Debug failed" });
    }
};

export const backfillOrderCategories = async (req, res) => {
    try {
        const orders = await orderModel.find({ status: 'completed' });
        let updatedCount = 0, categoryFixed = 0, completedAtFixed = 0;
        const errors = [];

        for (const order of orders) {
            try {
                await order.populate("menuItems.menuId", "menuCategory name");
                let changed = false;
                if (!order.completedAt) { order.completedAt = order.updatedAt || order.createdAt; completedAtFixed++; changed = true; }
                for (const mi of order.menuItems) {
                    const newCategory = mi.menuId?.menuCategory || "uncategorized";
                    if ((!mi.category || mi.category === 'uncategorized') && mi.menuId?.menuCategory && mi.menuId.menuCategory !== 'uncategorized') {
                        mi.category = newCategory; categoryFixed++; changed = true;
                    }
                }
                if (changed) { await order.save(); updatedCount++; }
            } catch (err) { errors.push({ orderId: order._id, error: err.message }); }
        }

        return res.status(200).json({
            success: true, message: "Backfill complete",
            totalProcessed: orders.length, ordersUpdated: updatedCount,
            categoriesFixed: categoryFixed, completedAtFixed: completedAtFixed,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Backfill failed", error: error.message });
    }
};

export const debugTodayOrders = async (req, res) => {
    try {
        const { date } = req.query;
        let targetDate = date ? new Date(date + 'T00:00:00') : new Date();
        if (!date) targetDate.setHours(0, 0, 0, 0);
        const nextDate = new Date(targetDate); nextDate.setDate(nextDate.getDate() + 1);

        const orders = await orderModel.find({
            status: 'completed', completedAt: { $gte: targetDate, $lt: nextDate }
        }).select('menuItems completedAt status tableNumber');

        return res.status(200).json({
            success: true, targetDate, nextDate, orderCount: orders.length,
            orders: orders.map(o => ({
                id: o._id, tableNumber: o.tableNumber, completedAt: o.completedAt,
                menuItems: o.menuItems.map(mi => ({ name: mi.name, category: mi.category || 'MISSING!', price: mi.price, quantity: mi.quantity }))
            }))
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};