// src/utils/env.js
import dotenv from "dotenv";
dotenv.config();

const env = {
    mongoURI: process.env.MONGODB_URI,
    jwtSecret: process.env.JWT_SECRET,
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
};

export default env;
