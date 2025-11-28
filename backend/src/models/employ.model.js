import mongoose from "mongoose";

const employSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: { 
        type: String, 
        required: true, 
        unique: true 
    },
    password: { 
        type: String, 
        required: true 
    },
    role: {
        type: String,
        enum: ["kitchen", "pending"], 
        default: "pending",
    },
    isAproved: { 
        type: Boolean, 
        default: false 
    }, 
    isVerified: { 
        type: Boolean, 
        default: false 
    }
}, {
    timestamps: true  // Optional: adds createdAt and updatedAt
});

export const employModel = mongoose.models.Employee || mongoose.model("Employee", employSchema);