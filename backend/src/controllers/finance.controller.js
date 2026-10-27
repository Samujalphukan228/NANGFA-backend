import mongoose from "mongoose";
import {
    financeCategoryModel,
    normalizeFinanceCategoryName,
    FINANCE_CATEGORY_KINDS,
} from "../models/financeCategory.model.js";
import {
    financeEntryModel,
    FINANCE_PAYMENT_METHODS,
} from "../models/financeEntry.model.js";
import { revenueModel } from "../models/revenue.model.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const roundMoney = (value) => {
    const number = Number(value) || 0;
    return Math.round((number + Number.EPSILON) * 100) / 100;
};

const formatDateKey = (value) => {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

/**
 * Accepts "YYYY-MM-DD", an ISO string or a Date and returns a Date at local
 * midnight. Returns null when the value is not a valid date.
 */
const parseDateOnly = (value) => {
    if (value === undefined || value === null || value === "") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
    }

    if (value instanceof Date) {
        if (isNaN(value.getTime())) return null;
        const copy = new Date(value);
        copy.setHours(0, 0, 0, 0);
        return copy;
    }

    const text = String(value).trim();

    // Treat plain dates as local dates (not UTC) so a day always means a day
    // in the restaurant's timezone.
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        const date = new Date(`${text}T00:00:00`);
        return isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(text);
    if (isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
};

const addDays = (value, days) => {
    const date = new Date(value);
    date.setDate(date.getDate() + days);
    date.setHours(0, 0, 0, 0);
    return date;
};

const getActor = (req) => {
    if (req.userType === "accountant" && req.employee) {
        return {
            id: String(req.employee._id),
            name: req.employee.name || req.employee.email || "Accountant",
        };
    }
    if (req.admin) {
        return {
            id: String(req.admin._id || "admin"),
            name: "Admin",
        };
    }
    return { id: null, name: null };
};

const emitFinanceEvent = (req, event, payload) => {
    const io = req.app.get("io");
    if (!io) return;
    io.to("admin").emit(event, payload);
    io.to("accountant").emit(event, payload);
};

const escapeRegex = (value = "") =>
    String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseAmount = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return roundMoney(amount);
};

const isPlainObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);

const resolveCategory = async ({ categoryId, category }) => {
    let found = null;

    if (categoryId && mongoose.isValidObjectId(categoryId)) {
        found = await financeCategoryModel.findById(categoryId);
    }

    if (!found && category) {
        const raw = String(category).trim();
        if (mongoose.isValidObjectId(raw)) {
            found = await financeCategoryModel.findById(raw);
        }
        if (!found) {
            found = await financeCategoryModel.findOne({
                normalizedName: normalizeFinanceCategoryName(raw),
            });
        }
    }

    return found;
};

// ---------------------------------------------------------------------------
// Report calculations
// ---------------------------------------------------------------------------

const buildTotals = ({ linkedSale = 0, linkedSaleOrders = 0, byKind = {}, entryCount = 0 }) => {
    const sale = roundMoney(linkedSale);
    const saleAdjustments = roundMoney(byKind.sale_adjustment || 0);
    const finalSale = roundMoney(sale - saleAdjustments);
    const expenses = roundMoney(byKind.expense || 0);
    const finalProfit = roundMoney(finalSale - expenses);
    const personalExpense = roundMoney(byKind.personal_expense || 0);
    const savings = roundMoney(finalProfit - personalExpense);

    return {
        // Sale formula: final sale = linked sale - sale adjustments
        linkedSale: sale,
        linkedSaleOrders: Number(linkedSaleOrders) || 0,
        saleAdjustments,
        finalSale,

        // Profit formula: final profit = final sale - expenses
        expenses,
        finalProfit,

        // Savings formula: savings = final profit - personal expense
        personalExpense,
        savings,

        // Informational, not part of the profit formula
        investment: roundMoney(byKind.investment || 0),
        otherIncome: roundMoney(byKind.income || 0),

        entryCount: Number(entryCount) || 0,
    };
};

const getTotalsBetween = async (startDate, endDateExclusive) => {
    const match = { date: { $gte: startDate, $lt: endDateExclusive } };

    const [revenueAgg, kindAgg, categoryAgg] = await Promise.all([
        revenueModel.aggregate([
            { $match: { date: { $gte: startDate, $lt: endDateExclusive } } },
            {
                $group: {
                    _id: null,
                    amount: { $sum: "$amount" },
                    orderCount: { $sum: "$orderCount" },
                },
            },
        ]),
        financeEntryModel.aggregate([
            { $match: match },
            {
                $group: {
                    _id: "$categoryKind",
                    amount: { $sum: "$amount" },
                    count: { $sum: 1 },
                },
            },
        ]),
        financeEntryModel.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { id: "$category", kind: "$categoryKind" },
                    name: { $first: "$categoryName" },
                    amount: { $sum: "$amount" },
                    count: { $sum: 1 },
                },
            },
            { $sort: { amount: -1 } },
        ]),
    ]);

    const byKind = {};
    let entryCount = 0;
    for (const row of kindAgg) {
        byKind[row._id] = roundMoney(row.amount);
        entryCount += row.count;
    }

    const categoryBreakdown = categoryAgg.map((row) => ({
        categoryId: row._id?.id ? String(row._id.id) : null,
        name: row.name || "Unknown",
        kind: row._id?.kind || "expense",
        amount: roundMoney(row.amount),
        count: row.count,
    }));

    const totals = buildTotals({
        linkedSale: revenueAgg[0]?.amount || 0,
        linkedSaleOrders: revenueAgg[0]?.orderCount || 0,
        byKind,
        entryCount,
    });

    return { ...totals, categoryBreakdown };
};

const buildDailySeries = async (startDate, endDateInclusive) => {
    const endDateExclusive = addDays(endDateInclusive, 1);
    const dateMatch = { date: { $gte: startDate, $lt: endDateExclusive } };

    const [revenues, entries] = await Promise.all([
        revenueModel
            .find(dateMatch)
            .select("date amount orderCount")
            .lean(),
        financeEntryModel
            .find(dateMatch)
            .select("date categoryKind amount")
            .lean(),
    ]);

    const buckets = new Map();
    const getBucket = (key) => {
        if (!buckets.has(key)) {
            buckets.set(key, {
                linkedSale: 0,
                linkedSaleOrders: 0,
                byKind: {},
                entryCount: 0,
            });
        }
        return buckets.get(key);
    };

    for (const revenue of revenues) {
        const bucket = getBucket(formatDateKey(revenue.date));
        bucket.linkedSale += Number(revenue.amount) || 0;
        bucket.linkedSaleOrders += Number(revenue.orderCount) || 0;
    }

    for (const entry of entries) {
        const bucket = getBucket(formatDateKey(entry.date));
        bucket.byKind[entry.categoryKind] =
            (bucket.byKind[entry.categoryKind] || 0) + (Number(entry.amount) || 0);
        bucket.entryCount += 1;
    }

    const series = [];
    for (
        let cursor = new Date(startDate);
        cursor.getTime() <= endDateInclusive.getTime();
        cursor = addDays(cursor, 1)
    ) {
        const key = formatDateKey(cursor);
        const bucket = buckets.get(key) || {
            linkedSale: 0,
            linkedSaleOrders: 0,
            byKind: {},
            entryCount: 0,
        };
        series.push({ date: key, ...buildTotals(bucket) });
    }

    return series;
};

// ---------------------------------------------------------------------------
// Finance categories
// ---------------------------------------------------------------------------

export const getFinanceCategories = async (req, res) => {
    try {
        const { kind, includeInactive, startDate, endDate } = req.query;

        if (kind && !FINANCE_CATEGORY_KINDS.includes(kind)) {
            return res.status(400).json({
                success: false,
                message: `Invalid category kind. Allowed: ${FINANCE_CATEGORY_KINDS.join(", ")}`,
            });
        }

        const filter = {};
        if (kind) filter.kind = kind;
        if (includeInactive !== "true" && includeInactive !== "1") {
            filter.isActive = true;
        }

        const categories = await financeCategoryModel
            .find(filter)
            .sort({ sortOrder: 1, name: 1 })
            .lean();

        // Attach all-time (or date-filtered) totals so the UI can show how
        // much was spent under each category.
        const entryMatch = {};
        if (startDate || endDate) {
            const start = startDate
                ? parseDateOnly(startDate)
                : parseDateOnly("1970-01-01");
            let end = endDate ? parseDateOnly(endDate) : parseDateOnly();
            if (!start || !end) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid startDate or endDate",
                });
            }
            if (end.getTime() < start.getTime()) {
                if (endDate) {
                    return res.status(400).json({
                        success: false,
                        message: "endDate cannot be before startDate",
                    });
                }
                end = start;
            }
            entryMatch.date = { $gte: start, $lt: addDays(end, 1) };
        }

        const totals = await financeEntryModel.aggregate([
            { $match: entryMatch },
            {
                $group: {
                    _id: "$category",
                    amount: { $sum: "$amount" },
                    count: { $sum: 1 },
                },
            },
        ]);

        const totalMap = new Map(
            totals.map((row) => [
                String(row._id),
                { totalAmount: roundMoney(row.amount), entryCount: row.count },
            ])
        );

        return res.status(200).json({
            success: true,
            count: categories.length,
            categories: categories.map((category) => ({
                ...category,
                totalAmount: totalMap.get(String(category._id))?.totalAmount || 0,
                entryCount: totalMap.get(String(category._id))?.entryCount || 0,
            })),
        });
    } catch (error) {
        console.error("getFinanceCategories error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch finance categories",
        });
    }
};

export const createFinanceCategory = async (req, res) => {
    try {
        const { name, kind, description, sortOrder, isSystem } = req.body;

        if (!name || !String(name).trim()) {
            return res.status(400).json({
                success: false,
                message: "Category name is required",
            });
        }

        const categoryKind = kind || "expense";
        if (!FINANCE_CATEGORY_KINDS.includes(categoryKind)) {
            return res.status(400).json({
                success: false,
                message: `Invalid category kind. Allowed: ${FINANCE_CATEGORY_KINDS.join(", ")}`,
            });
        }

        const normalizedName = normalizeFinanceCategoryName(name);
        const existing = await financeCategoryModel.findOne({ normalizedName });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: `A category named "${existing.name}" already exists`,
                category: existing,
            });
        }

        const actor = getActor(req);
        const category = await financeCategoryModel.create({
            name: String(name).trim(),
            kind: categoryKind,
            description: description ? String(description).trim() : "",
            sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
            isSystem: isSystem === true,
            createdBy: actor.id,
        });

        emitFinanceEvent(req, "finance:category:created", category);

        return res.status(201).json({
            success: true,
            message: "Finance category created successfully",
            category,
        });
    } catch (error) {
        console.error("createFinanceCategory error:", error);
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A category with this name already exists",
            });
        }
        return res.status(500).json({
            success: false,
            message: "Failed to create finance category",
        });
    }
};

export const updateFinanceCategory = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid category id",
            });
        }

        const category = await financeCategoryModel.findById(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Finance category not found",
            });
        }

        const { name, kind, description, sortOrder, isActive } = req.body;
        let nameChanged = false;
        let kindChanged = false;

        if (name !== undefined) {
            const nextName = String(name).trim();
            if (!nextName) {
                return res.status(400).json({
                    success: false,
                    message: "Category name cannot be empty",
                });
            }

            const normalizedName = normalizeFinanceCategoryName(nextName);
            const duplicate = await financeCategoryModel.findOne({
                normalizedName,
                _id: { $ne: category._id },
            });
            if (duplicate) {
                return res.status(409).json({
                    success: false,
                    message: `A category named "${duplicate.name}" already exists`,
                });
            }

            nameChanged = category.name !== nextName;
            category.name = nextName;
        }

        if (kind !== undefined) {
            if (!FINANCE_CATEGORY_KINDS.includes(kind)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid category kind. Allowed: ${FINANCE_CATEGORY_KINDS.join(", ")}`,
                });
            }
            kindChanged = category.kind !== kind;
            category.kind = kind;
        }

        if (description !== undefined) category.description = String(description).trim();
        if (sortOrder !== undefined && Number.isFinite(Number(sortOrder))) {
            category.sortOrder = Number(sortOrder);
        }
        if (isActive !== undefined) category.isActive = isActive === true || isActive === "true";
        category.updatedBy = getActor(req).id;

        await category.save();

        // Keep the snapshot fields on existing entries in sync.
        if (nameChanged || kindChanged) {
            const snapshotUpdate = {};
            if (nameChanged) snapshotUpdate.categoryName = category.name;
            if (kindChanged) snapshotUpdate.categoryKind = category.kind;

            await financeEntryModel.updateMany(
                { category: category._id },
                { $set: snapshotUpdate }
            );
        }

        emitFinanceEvent(req, "finance:category:updated", category);

        return res.status(200).json({
            success: true,
            message: "Finance category updated successfully",
            category,
        });
    } catch (error) {
        console.error("updateFinanceCategory error:", error);
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A category with this name already exists",
            });
        }
        return res.status(500).json({
            success: false,
            message: "Failed to update finance category",
        });
    }
};

export const deleteFinanceCategory = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid category id",
            });
        }

        const category = await financeCategoryModel.findById(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Finance category not found",
            });
        }

        if (category.isSystem) {
            return res.status(400).json({
                success: false,
                message: "System categories cannot be deleted",
            });
        }

        const entryCount = await financeEntryModel.countDocuments({ category: id });
        if (entryCount > 0) {
            return res.status(400).json({
                success: false,
                message: `This category has ${entryCount} entr${entryCount === 1 ? "y" : "ies"}. Deactivate it instead of deleting it.`,
                entryCount,
            });
        }

        await financeCategoryModel.findByIdAndDelete(id);
        emitFinanceEvent(req, "finance:category:deleted", { id });

        return res.status(200).json({
            success: true,
            message: "Finance category deleted successfully",
        });
    } catch (error) {
        console.error("deleteFinanceCategory error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete finance category",
        });
    }
};

// ---------------------------------------------------------------------------
// Finance entries
// ---------------------------------------------------------------------------

const buildEntryPayload = async ({ body, category, actor, existing = null }) => {
    const payload = {};

    if (body.date !== undefined || !existing) {
        const date = parseDateOnly(body.date);
        if (!date) throw new Error("Invalid date");
        payload.date = date;
    }

    if (!existing || body.amount !== undefined) {
        const amount = parseAmount(body.amount);
        if (amount === null) throw new Error("Amount must be greater than 0");
        payload.amount = amount;
    }

    if (category) {
        payload.category = category._id;
        payload.categoryName = category.name;
        payload.categoryKind = category.kind;
    }

    if (body.description !== undefined) payload.description = String(body.description).trim();
    if (body.itemName !== undefined) payload.itemName = String(body.itemName).trim();
    if (body.vendor !== undefined) payload.vendor = String(body.vendor).trim();
    if (body.reference !== undefined) payload.reference = String(body.reference).trim();

    if (body.paymentMethod !== undefined) {
        const method = String(body.paymentMethod).toLowerCase();
        if (!FINANCE_PAYMENT_METHODS.includes(method)) {
            throw new Error(
                `Invalid payment method. Allowed: ${FINANCE_PAYMENT_METHODS.join(", ")}`
            );
        }
        payload.paymentMethod = method;
    }

    if (!existing) {
        payload.createdBy = actor.id;
        payload.createdByName = actor.name;
    } else {
        payload.updatedBy = actor.id;
        payload.updatedByName = actor.name;
    }

    return payload;
};

export const listFinanceEntries = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            startDate,
            endDate,
            categoryId,
            kind,
            search,
        } = req.query;

        const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

        const filter = {};

        if (startDate) {
            const start = parseDateOnly(startDate);
            if (!start) {
                return res.status(400).json({ success: false, message: "Invalid startDate" });
            }
            filter.date = { ...(filter.date || {}), $gte: start };
        }

        if (endDate) {
            const end = parseDateOnly(endDate);
            if (!end) {
                return res.status(400).json({ success: false, message: "Invalid endDate" });
            }
            filter.date = { ...(filter.date || {}), $lt: addDays(end, 1) };
        }

        if (categoryId) {
            if (!mongoose.isValidObjectId(categoryId)) {
                return res.status(400).json({ success: false, message: "Invalid categoryId" });
            }
            filter.category = categoryId;
        }

        if (kind) {
            if (!FINANCE_CATEGORY_KINDS.includes(kind)) {
                return res.status(400).json({ success: false, message: "Invalid kind" });
            }
            filter.categoryKind = kind;
        }

        if (search && String(search).trim()) {
            const pattern = new RegExp(escapeRegex(String(search).trim()), "i");
            filter.$or = [
                { description: pattern },
                { itemName: pattern },
                { vendor: pattern },
                { categoryName: pattern },
                { reference: pattern },
            ];
        }

        const [entries, total] = await Promise.all([
            financeEntryModel
                .find(filter)
                .populate("category", "name kind isActive")
                .sort({ date: -1, createdAt: -1 })
                .skip((pageNumber - 1) * pageSize)
                .limit(pageSize)
                .lean(),
            financeEntryModel.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            count: entries.length,
            total,
            page: pageNumber,
            limit: pageSize,
            totalPages: Math.ceil(total / pageSize),
            entries,
        });
    } catch (error) {
        console.error("listFinanceEntries error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch finance entries",
        });
    }
};

export const getFinanceEntryById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid entry id" });
        }

        const entry = await financeEntryModel
            .findById(id)
            .populate("category", "name kind isActive");

        if (!entry) {
            return res.status(404).json({
                success: false,
                message: "Finance entry not found",
            });
        }

        return res.status(200).json({ success: true, entry });
    } catch (error) {
        console.error("getFinanceEntryById error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch finance entry",
        });
    }
};

export const createFinanceEntry = async (req, res) => {
    try {
        const { categoryId, category } = req.body;

        const resolvedCategory = await resolveCategory({ categoryId, category });
        if (!resolvedCategory) {
            return res.status(400).json({
                success: false,
                message: "A valid category is required",
            });
        }

        if (!resolvedCategory.isActive) {
            return res.status(400).json({
                success: false,
                message: "This category is inactive. Activate it before adding entries.",
            });
        }

        const actor = getActor(req);
        let payload;
        try {
            payload = await buildEntryPayload({
                body: req.body,
                category: resolvedCategory,
                actor,
            });
        } catch (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError.message,
            });
        }

        const entry = await financeEntryModel.create(payload);
        await entry.populate("category", "name kind isActive");

        emitFinanceEvent(req, "finance:entry:created", entry);

        return res.status(201).json({
            success: true,
            message: "Finance entry added successfully",
            entry,
        });
    } catch (error) {
        console.error("createFinanceEntry error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to add finance entry",
        });
    }
};

export const bulkCreateFinanceEntries = async (req, res) => {
    try {
        const incoming = Array.isArray(req.body) ? req.body : req.body.entries;

        if (!Array.isArray(incoming) || incoming.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Provide a non-empty array of entries",
            });
        }

        if (incoming.length > 500) {
            return res.status(400).json({
                success: false,
                message: "A maximum of 500 entries can be added at once",
            });
        }

        const actor = getActor(req);
        const categoryCache = new Map();
        const documents = [];

        for (let index = 0; index < incoming.length; index += 1) {
            const item = incoming[index];

            if (!isPlainObject(item)) {
                return res.status(400).json({
                    success: false,
                    message: `Entry at position ${index + 1} is invalid`,
                });
            }

            const cacheKey = item.categoryId
                ? `id:${item.categoryId}`
                : `name:${normalizeFinanceCategoryName(item.category || "")}`;

            let categoryDoc = categoryCache.get(cacheKey);
            if (!categoryDoc) {
                categoryDoc = await resolveCategory(item);
                if (categoryDoc) categoryCache.set(cacheKey, categoryDoc);
            }

            if (!categoryDoc) {
                return res.status(400).json({
                    success: false,
                    message: `Entry at position ${index + 1}: valid category is required`,
                });
            }

            if (!categoryDoc.isActive) {
                return res.status(400).json({
                    success: false,
                    message: `Entry at position ${index + 1}: category "${categoryDoc.name}" is inactive`,
                });
            }

            try {
                const payload = await buildEntryPayload({
                    body: item,
                    category: categoryDoc,
                    actor,
                });
                documents.push(payload);
            } catch (validationError) {
                return res.status(400).json({
                    success: false,
                    message: `Entry at position ${index + 1}: ${validationError.message}`,
                });
            }
        }

        const entries = await financeEntryModel.insertMany(documents);
        emitFinanceEvent(req, "finance:entries:created", {
            count: entries.length,
            entries,
        });

        return res.status(201).json({
            success: true,
            message: `${entries.length} finance entr${entries.length === 1 ? "y" : "ies"} added successfully`,
            count: entries.length,
            entries,
        });
    } catch (error) {
        console.error("bulkCreateFinanceEntries error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to add finance entries",
        });
    }
};

export const updateFinanceEntry = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid entry id" });
        }

        const entry = await financeEntryModel.findById(id);
        if (!entry) {
            return res.status(404).json({
                success: false,
                message: "Finance entry not found",
            });
        }

        let resolvedCategory = null;
        if (req.body.categoryId !== undefined || req.body.category !== undefined) {
            resolvedCategory = await resolveCategory({
                categoryId: req.body.categoryId,
                category: req.body.category,
            });

            if (!resolvedCategory) {
                return res.status(400).json({
                    success: false,
                    message: "A valid category is required",
                });
            }

            if (!resolvedCategory.isActive) {
                return res.status(400).json({
                    success: false,
                    message: "This category is inactive. Activate it before using it.",
                });
            }
        }

        const actor = getActor(req);
        let payload;
        try {
            payload = await buildEntryPayload({
                body: req.body,
                category: resolvedCategory,
                actor,
                existing: entry,
            });
        } catch (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError.message,
            });
        }

        Object.assign(entry, payload);
        await entry.save();
        await entry.populate("category", "name kind isActive");

        emitFinanceEvent(req, "finance:entry:updated", entry);

        return res.status(200).json({
            success: true,
            message: "Finance entry updated successfully",
            entry,
        });
    } catch (error) {
        console.error("updateFinanceEntry error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update finance entry",
        });
    }
};

export const deleteFinanceEntry = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid entry id" });
        }

        const entry = await financeEntryModel.findByIdAndDelete(id);
        if (!entry) {
            return res.status(404).json({
                success: false,
                message: "Finance entry not found",
            });
        }

        emitFinanceEvent(req, "finance:entry:deleted", { id });

        return res.status(200).json({
            success: true,
            message: "Finance entry deleted successfully",
        });
    } catch (error) {
        console.error("deleteFinanceEntry error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete finance entry",
        });
    }
};

// ---------------------------------------------------------------------------
// Item names (optional sub-items used inside a category)
// ---------------------------------------------------------------------------

export const getFinanceItems = async (req, res) => {
    try {
        const { categoryId, kind, startDate, endDate } = req.query;
        const match = { itemName: { $nin: [null, ""] } };

        if (categoryId) {
            if (!mongoose.isValidObjectId(categoryId)) {
                return res.status(400).json({ success: false, message: "Invalid categoryId" });
            }
            match.category = new mongoose.Types.ObjectId(categoryId);
        }

        if (kind) {
            if (!FINANCE_CATEGORY_KINDS.includes(kind)) {
                return res.status(400).json({ success: false, message: "Invalid kind" });
            }
            match.categoryKind = kind;
        }

        if (startDate || endDate) {
            const start = startDate
                ? parseDateOnly(startDate)
                : parseDateOnly("1970-01-01");
            let end = endDate ? parseDateOnly(endDate) : parseDateOnly();

            if (!start || !end) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid date range",
                });
            }

            if (end.getTime() < start.getTime()) {
                if (endDate) {
                    return res.status(400).json({
                        success: false,
                        message: "endDate cannot be before startDate",
                    });
                }
                end = start;
            }

            match.date = { $gte: start, $lt: addDays(end, 1) };
        }

        const items = await financeEntryModel.aggregate([
            { $match: match },
            {
                $group: {
                    _id: "$itemName",
                    totalAmount: { $sum: "$amount" },
                    entryCount: { $sum: 1 },
                    categories: { $addToSet: "$categoryName" },
                },
            },
            { $sort: { entryCount: -1, totalAmount: -1 } },
        ]);

        return res.status(200).json({
            success: true,
            count: items.length,
            items: items.map((item) => ({
                itemName: item._id,
                totalAmount: roundMoney(item.totalAmount),
                entryCount: item.entryCount,
                categories: item.categories,
            })),
        });
    } catch (error) {
        console.error("getFinanceItems error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch finance item names",
        });
    }
};

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const getFinanceSummary = async (req, res) => {
    try {
        const date = parseDateOnly(req.query.date);
        if (!date) {
            return res.status(400).json({
                success: false,
                message: "Invalid date. Use YYYY-MM-DD.",
            });
        }

        const nextDay = addDays(date, 1);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const last7Start = addDays(date, -6);
        const beginning = new Date(0);

        const [daily, cumulative, monthToDate, last7Days] = await Promise.all([
            getTotalsBetween(date, nextDay),
            getTotalsBetween(beginning, nextDay),
            getTotalsBetween(monthStart, nextDay),
            buildDailySeries(last7Start, date),
        ]);

        return res.status(200).json({
            success: true,
            date: formatDateKey(date),
            daily,
            cumulative,
            monthToDate,
            last7Days,
        });
    } catch (error) {
        console.error("getFinanceSummary error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to build finance summary",
        });
    }
};

export const getFinanceDailyReport = async (req, res) => {
    try {
        const date = parseDateOnly(req.query.date);
        if (!date) {
            return res.status(400).json({
                success: false,
                message: "Invalid date. Use YYYY-MM-DD.",
            });
        }

        const report = await getTotalsBetween(date, addDays(date, 1));

        return res.status(200).json({
            success: true,
            date: formatDateKey(date),
            ...report,
        });
    } catch (error) {
        console.error("getFinanceDailyReport error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to build daily finance report",
        });
    }
};

export const getFinanceRangeSummary = async (req, res) => {
    try {
        if (!req.query.startDate || !req.query.endDate) {
            return res.status(400).json({
                success: false,
                message: "startDate and endDate are required (YYYY-MM-DD)",
            });
        }

        const start = parseDateOnly(req.query.startDate);
        const end = parseDateOnly(req.query.endDate);

        if (!start || !end) {
            return res.status(400).json({
                success: false,
                message: "Valid startDate and endDate are required (YYYY-MM-DD)",
            });
        }

        if (end.getTime() < start.getTime()) {
            return res.status(400).json({
                success: false,
                message: "endDate cannot be before startDate",
            });
        }

        const dayCount =
            Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

        if (dayCount > 3660) {
            return res.status(400).json({
                success: false,
                message: "Date range is too large. Maximum is 10 years.",
            });
        }

        const endExclusive = addDays(end, 1);
        const [range, cumulative, days] = await Promise.all([
            getTotalsBetween(start, endExclusive),
            getTotalsBetween(new Date(0), endExclusive),
            buildDailySeries(start, end),
        ]);

        return res.status(200).json({
            success: true,
            startDate: formatDateKey(start),
            endDate: formatDateKey(end),
            dayCount,
            range,
            cumulative,
            days,
        });
    } catch (error) {
        console.error("getFinanceRangeSummary error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to build finance range summary",
        });
    }
};

// ---------------------------------------------------------------------------
// Metadata + default categories
// ---------------------------------------------------------------------------

const DEFAULT_FINANCE_CATEGORIES = [
    // Business expenses
    { name: "Gas", kind: "expense" },
    { name: "Vegetable", kind: "expense" },
    { name: "Gupta Store", kind: "expense" },
    { name: "SSP Store", kind: "expense" },
    { name: "Hari Chacha Masala", kind: "expense" },
    { name: "Chicken", kind: "expense" },
    { name: "Big Fish", kind: "expense" },
    { name: "Small Fish", kind: "expense" },
    { name: "Pork", kind: "expense" },
    { name: "Duck", kind: "expense" },
    { name: "Tuktuki", kind: "expense" },
    { name: "Beleg Tuktuki", kind: "expense" },
    { name: "Peha/Bahira Dukan", kind: "expense" },
    { name: "Glass/Napkin/Packing Pouch/20 L Bottle", kind: "expense" },
    { name: "Maintenance", kind: "expense" },
    { name: "Electricity", kind: "expense" },
    { name: "Salary", kind: "expense" },
    { name: "Other Expense", kind: "expense" },

    // Capital / investment
    { name: "New Investment", kind: "investment" },

    // Adjustments and personal spending
    { name: "Sale Adjustment", kind: "sale_adjustment" },
    { name: "Personal Expense", kind: "personal_expense" },

    // Other income
    { name: "Other Income", kind: "income" },
];

export const seedDefaultFinanceCategories = async (req, res) => {
    try {
        const actor = getActor(req);
        const created = [];
        const existing = [];

        for (let index = 0; index < DEFAULT_FINANCE_CATEGORIES.length; index += 1) {
            const definition = DEFAULT_FINANCE_CATEGORIES[index];
            const normalizedName = normalizeFinanceCategoryName(definition.name);

            const found = await financeCategoryModel.findOne({ normalizedName });
            if (found) {
                existing.push(found);
                continue;
            }

            const category = await financeCategoryModel.create({
                ...definition,
                sortOrder: index,
                createdBy: actor.id,
            });
            created.push(category);
        }

        if (created.length > 0) {
            emitFinanceEvent(req, "finance:categories:seeded", {
                count: created.length,
                categories: created,
            });
        }

        return res.status(200).json({
            success: true,
            message: `${created.length} default categor${created.length === 1 ? "y" : "ies"} created, ${existing.length} already existed`,
            createdCount: created.length,
            existingCount: existing.length,
            categories: [...existing, ...created],
        });
    } catch (error) {
        console.error("seedDefaultFinanceCategories error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to seed default finance categories",
        });
    }
};

export const getFinanceMeta = async (req, res) => {
    return res.status(200).json({
        success: true,
        categoryKinds: FINANCE_CATEGORY_KINDS,
        paymentMethods: FINANCE_PAYMENT_METHODS,
        formulas: {
            finalSale: "linkedSale - saleAdjustments",
            finalProfit: "finalSale - expenses",
            savings: "finalProfit - personalExpense",
        },
        notes: {
            linkedSale:
                "Automatically taken from completed restaurant orders (daily revenue).",
            saleAdjustments:
                "Entries whose category kind is 'sale_adjustment'.",
            expenses: "Entries whose category kind is 'expense'.",
            personalExpense:
                "Entries whose category kind is 'personal_expense'.",
            investment:
                "Entries whose category kind is 'investment'. Shown separately and NOT subtracted from profit.",
            otherIncome:
                "Entries whose category kind is 'income'. Shown separately and NOT added to the restaurant sale.",
        },
        defaultCategories: DEFAULT_FINANCE_CATEGORIES,
    });
};
