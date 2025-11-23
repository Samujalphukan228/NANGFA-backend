import mongoose from "mongoose";
import env from "../utils/env.js";

export const connectDB = async () => {
    try {
        await mongoose.connect(env.database);
    } catch (error) {
        process.exit(1);
    }
};