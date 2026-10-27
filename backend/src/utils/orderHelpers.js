import { menuModel } from "../models/menu.model.js";

/**
 * Shared helpers used by the admin order controller and the waiter controller.
 */

export const validateAndCalculateTotal = async (menuItems) => {
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

export const normalizeTableNumber = (tableNumber) => {
    if (tableNumber === null || tableNumber === undefined) return [];

    if (Array.isArray(tableNumber)) {
        return tableNumber
            .filter((t) => t !== null && t !== undefined && t !== "")
            .map((t) => parseInt(t))
            .filter((t) => !isNaN(t))
            .sort((a, b) => a - b);
    }

    if (typeof tableNumber === "string") {
        if (tableNumber.trim() === "") return [];
        if (tableNumber.includes(","))
            return tableNumber
                .split(",")
                .map((t) => parseInt(t.trim()))
                .filter((t) => !isNaN(t))
                .sort((a, b) => a - b);
        const num = parseInt(tableNumber.trim());
        return isNaN(num) ? [] : [num];
    }

    if (typeof tableNumber === "number") {
        return isNaN(tableNumber) ? [] : [tableNumber];
    }

    return [];
};

export const formatTableDisplay = (tableNumbers) => {
    if (!tableNumbers || tableNumbers.length === 0) return "No Table";
    if (tableNumbers.length === 1) return `Table ${tableNumbers[0]}`;
    return `Tables ${tableNumbers.join(", ")}`;
};

export const formatCategoryName = (category) => {
    if (!category || category === "uncategorized") return "Uncategorized";
    return category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

export const findOrderChanges = (oldOrder, newMenuItems) => {
    const changes = {
        newItems: [],
        removedItems: [],
        updatedItems: [],
        added: [],
        removed: [],
        updated: [],
    };

    const oldItemsMap = new Map();
    oldOrder.menuItems.forEach((item) => {
        const menuId = item.menuId?._id
            ? item.menuId._id.toString()
            : item.menuId.toString();
        oldItemsMap.set(menuId, {
            quantity: item.quantity,
            name: item.menuId?.name || item.name || "Unknown",
            category: item.menuId?.category || item.category || "uncategorized",
        });
    });

    const newItemsMap = new Map();
    newMenuItems.forEach((item) => {
        newItemsMap.set(item.menuId.toString(), {
            quantity: item.quantity,
            name: item.name,
            category: item.category || "uncategorized",
        });
    });

    newItemsMap.forEach((newItem, menuId) => {
        if (!oldItemsMap.has(menuId)) {
            changes.newItems.push({
                menuId,
                name: newItem.name,
                category: newItem.category,
                quantity: newItem.quantity,
            });
            changes.added.push({
                menuId,
                name: newItem.name,
                category: newItem.category,
                quantity: newItem.quantity,
            });
        }
    });

    oldItemsMap.forEach((oldItem, menuId) => {
        if (!newItemsMap.has(menuId)) {
            changes.removedItems.push({
                menuId,
                name: oldItem.name,
                category: oldItem.category,
                quantity: oldItem.quantity,
            });
            changes.removed.push({
                menuId,
                name: oldItem.name,
                category: oldItem.category,
                quantity: oldItem.quantity,
            });
        }
    });

    newItemsMap.forEach((newItem, menuId) => {
        const oldItem = oldItemsMap.get(menuId);
        if (oldItem && oldItem.quantity !== newItem.quantity) {
            const type =
                newItem.quantity > oldItem.quantity ? "increased" : "decreased";
            changes.updatedItems.push({
                menuId,
                name: newItem.name,
                category: newItem.category,
                oldQuantity: oldItem.quantity,
                newQuantity: newItem.quantity,
                type,
            });
            changes.updated.push({
                menuId,
                name: newItem.name,
                category: newItem.category,
                oldQuantity: oldItem.quantity,
                newQuantity: newItem.quantity,
                change: newItem.quantity - oldItem.quantity,
            });
        }
    });

    return changes;
};

/** Emit an order event to every relevant room plus a global broadcast. */
export const emitToAll = (io, event, data) => {
    io.to("kitchen").emit(event, data);
    io.to("admin").emit(event, data);
    io.to("waiter").emit(event, data);
    io.emit(event, data);
};
