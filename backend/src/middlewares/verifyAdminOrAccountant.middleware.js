import jwt from "jsonwebtoken";
import env from "../utils/env.js";
import { employModel } from "../models/employ.model.js";

/**
 * Allows either the hard-coded admin account or an approved & active
 * employee whose role is "accountant".
 */
export const verifyAdminOrAccountant = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Not authenticated",
            });
        }

        const decoded = jwt.verify(token, env.jwtSecret);

        // Admin always passes
        if (decoded.email === env.adminEmail) {
            req.admin = {
                _id: "admin",
                email: env.adminEmail,
                role: "admin",
                isVerified: true,
            };
            req.userType = "admin";
            return next();
        }

        const employee = await employModel.findById(decoded.id);

        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Account not found",
            });
        }

        if (!employee.isVerified) {
            return res.status(403).json({
                success: false,
                message: "Account not verified",
            });
        }

        if (!employee.isAproved || employee.role !== "accountant") {
            return res.status(403).json({
                success: false,
                message: "Not authorized — accountant access required",
            });
        }

        if (!employee.isActive) {
            return res.status(403).json({
                success: false,
                message: "Your account has been deactivated. Contact admin.",
            });
        }

        req.employee = employee;
        req.userType = "accountant";
        return next();
    } catch (error) {
        console.error("verifyAdminOrAccountant error:", error);
        return res.status(401).json({
            success: false,
            message:
                error.name === "TokenExpiredError"
                    ? "Token expired"
                    : "Invalid token",
        });
    }
};
