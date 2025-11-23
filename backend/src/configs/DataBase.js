import mongoose from "mongoose";
import env from "../utils/env.js";


export const connectDB = async () => {
    try {
        await mongoose.connect(env.database);
        console.log("DataBase is connected");
    } catch (error) {
        console.log("DataBase is failed to connect");
        
    }
}