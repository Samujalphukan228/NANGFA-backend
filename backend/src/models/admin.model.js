import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    isVerified: {
        type: Boolean,
        default: false,
    },     
    otp: {
        type: String,
    },
    otpExpires: {
        type: Date, 
    },
})

export const adminModel = mongoose.model("Admin", adminSchema)