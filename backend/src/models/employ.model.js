import mongoose from "mongoose";

const employSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: ["kitchen", "waiter", "pending"],
        default: "pending",
    },
    isAproved: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: false }, // ← NEW: admin must toggle ON manually
}, {
    timestamps: true
});

export const employModel = mongoose.models.Employee || mongoose.model("Employee", employSchema);