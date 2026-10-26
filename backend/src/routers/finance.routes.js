import express from "express";
import {
    getFinanceMeta,
    getFinanceCategories,
    createFinanceCategory,
    updateFinanceCategory,
    deleteFinanceCategory,
    seedDefaultFinanceCategories,
    getFinanceItems,
    listFinanceEntries,
    getFinanceEntryById,
    createFinanceEntry,
    bulkCreateFinanceEntries,
    updateFinanceEntry,
    deleteFinanceEntry,
    getFinanceSummary,
    getFinanceDailyReport,
    getFinanceRangeSummary,
} from "../controllers/finance.controller.js";
import { verifyAdminOrAccountant } from "../middlewares/verifyAdminOrAccountant.middleware.js";

const financeRouter = express.Router();

// Every finance route is available to the admin and approved accountants only.
financeRouter.use(verifyAdminOrAccountant);

// Metadata (category kinds, payment methods, formulas)
financeRouter.get("/meta", getFinanceMeta);

// Categories
financeRouter.get("/categories", getFinanceCategories);
financeRouter.post("/categories", createFinanceCategory);
financeRouter.post("/categories/seed-defaults", seedDefaultFinanceCategories);
financeRouter.put("/categories/:id", updateFinanceCategory);
financeRouter.delete("/categories/:id", deleteFinanceCategory);

// Optional item names (e.g. "Chicken 2kg" under the "Chicken" category)
financeRouter.get("/items", getFinanceItems);

// Entries
financeRouter.get("/entries", listFinanceEntries);
financeRouter.post("/entries", createFinanceEntry);
financeRouter.post("/entries/bulk", bulkCreateFinanceEntries);
financeRouter.get("/entries/:id", getFinanceEntryById);
financeRouter.put("/entries/:id", updateFinanceEntry);
financeRouter.delete("/entries/:id", deleteFinanceEntry);

// Reports
financeRouter.get("/summary", getFinanceSummary);
financeRouter.get("/daily", getFinanceDailyReport);
financeRouter.get("/summary/range", getFinanceRangeSummary);

export default financeRouter;
