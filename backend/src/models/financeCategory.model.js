import mongoose from "mongoose";

/**
 * The kind of a finance category decides how its entries affect the reports.
 *
 * expense          -> money spent by the business (reduces profit)
 * sale_adjustment  -> reduces the linked restaurant sale
 * personal_expense -> money taken out after profit (reduces savings)
 * investment       -> capital put into / spent on the business (shown separately)
 * income           -> other income, not restaurant sale (shown separately)
 */
export const FINANCE_CATEGORY_KINDS = [
    "expense",
    "sale_adjustment",
    "personal_expense",
    "investment",
    "income",
];

const financeCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Category name is required"],
        trim: true,
        maxlength: [80, "Category name cannot be longer than 80 characters"],
    },
    // Lower-cased / whitespace-normalised name used for duplicate checks.
    normalizedName: {
        type: String,
        required: true,
        unique: true,
    },
    kind: {
        type: String,
        enum: FINANCE_CATEGORY_KINDS,
        default: "expense",
    },
    description: {
        type: String,
        trim: true,
        default: "",
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    // System categories are protected from deletion.
    isSystem: {
        type: Boolean,
        default: false,
    },
    sortOrder: {
        type: Number,
        default: 0,
    },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
}, {
    timestamps: true,
});

financeCategorySchema.pre("validate", function (next) {
    if (this.name) {
        this.normalizedName = String(this.name)
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase();
    }
    next();
});

financeCategorySchema.index({ kind: 1, isActive: 1, sortOrder: 1 });

export const financeCategoryModel =
    mongoose.models.FinanceCategory ||
    mongoose.model("FinanceCategory", financeCategorySchema);

export const normalizeFinanceCategoryName = (name = "") =>
    String(name).trim().replace(/\s+/g, " ").toLowerCase();
