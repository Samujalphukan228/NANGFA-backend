// admin.controller.js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import env from "../utils/env.js";

export const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        // Check if the email matches the env admin email
        if (email.toLowerCase() !== env.adminEmail.toLowerCase()) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        // Check if password matches env admin password
        // For production, you should hash the env password
        if (password !== env.adminPassword) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        // Generate token WITH EMAIL
        const token = jwt.sign(
            { 
                id: "admin", // or use a fixed admin ID
                email: email.toLowerCase()
            },
            env.jwtSecret,
            { expiresIn: "7d" }
        );

        console.log("Generated token for:", email); // Debug

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            admin: {
                _id: "admin",
                name: "Admin",
                email: email.toLowerCase(),
            }
        });

    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            success: false,
            message: "Login failed"
        });
    }
};