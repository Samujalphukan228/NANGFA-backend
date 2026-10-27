// src/utils/env.js
import dotenv from "dotenv";
dotenv.config();

const env = {
    mongoURI: process.env.MONGODB_URI,
    jwtSecret: process.env.JWT_SECRET,
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
};

const required = {
    MONGODB_URI: env.mongoURI,
    JWT_SECRET: env.jwtSecret,
    ADMIN_EMAIL: env.adminEmail,
    ADMIN_PASSWORD: env.adminPassword,
};

const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

if (missing.length > 0) {
    throw new Error(
        `Missing required environment variables: ${missing.join(", ")}. ` +
            "Copy .env.example to .env and fill in the values."
    );
}

export default env;
