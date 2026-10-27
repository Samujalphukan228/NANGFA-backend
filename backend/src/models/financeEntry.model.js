import mongoose from "mongoose";
import { FINANCE_CATEGORY_KINDS } from "./financeCategory.model.js";

export const FINANCE_PAYMENT_METHODS = [
    "cash",
    "upi",
    "card",
    "bank",
    "credit",
    "other",
];

/**
 * A single finance transaction (expense, sale adjustment, personal expense,
 * investment or other income) recorded against a category.
 */
const financeEntrySchema = new mongoose.Schema({
    // Always stored at local midnight of the day the money moved.
    date: {
        type: Date,
        required: [true, "Date is required"],
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "FinanceCategory",
        required: [true, "Category is required"],
    },
    // Snapshots so reports stay readable even if a category is renamed.
    categoryName: {
        type: String,
        required: true,
        trim: true,
    },
    categoryKind: {
        type: String,
        enum: FINANCE_CATEGORY_KINDS,
        required: true,
    },
    amount: {
        type: Number,
        required: [true, "Amount is required"],
        min: [0, "Amount cannot be negative"],
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, "Description cannot be longer than 500 characters"],
        default: "",
    },
    // Optional sub-item name, e.g. "Chicken 2kg" under the "Chicken" category.
    itemName: {
        type: String,
        trim: true,
        maxlength: [120, "Item name cannot be longer than 120 characters"],
        default: "",
    },
    vendor: {
        type: String,
        trim: true,
        maxlength: [120, "Vendor cannot be longer than 120 characters"],
        default: "",
    },
    paymentMethod: {
        type: String,
        enum: FINANCE_PAYMENT_METHODS,
        default: "cash",
    },
    reference: {
        type: String,
        trim: true,
        maxlength: [120, "Reference cannot be longer than 120 characters"],
        default: "",
    },
    createdBy: { type: String, default: null },
    createdByName: { type: String, default: null },
    updatedBy: { type: String, default: null },
    updatedByName: { type: String, default: null },
}, {
    timestamps: true,
});

financeEntrySchema.pre("validate", function (next) {
    if (this.date) {
        const day = new Date(this.date);
        day.setHours(0, 0, 0, 0);
        this.date = day;
    }
    next();
});

financeEntrySchema.index({ date: -1 });
financeEntrySchema.index({ category: 1, date: -1 });
financeEntrySchema.index({ categoryKind: 1, date: -1 });

export const financeEntryModel =
    mongoose.models.FinanceEntry ||
    mongoose.model("FinanceEntry", financeEntrySchema);
