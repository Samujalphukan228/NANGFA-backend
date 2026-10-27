import env from "../utils/env.js";
import { employModel } from "../models/employ.model.js";
import {
    extractToken,
    isAdminToken,
    sendAuthError,
    sendMissingToken,
    verifyToken,
} from "../utils/auth.js";

/**
 * Allows either the hard-coded admin account or an approved & active
 * employee whose role is "accountant".
 */
export const verifyAdminOrAccountant = async (req, res, next) => {
    try {
        const token = extractToken(req);
        if (!token) return sendMissingToken(res);

        const decoded = verifyToken(token);

        // Admin always passes
        if (isAdminToken(decoded)) {
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
                message: "Not authorized - accountant access required",
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
        console.error("verifyAdminOrAccountant error:", error.message);
        return sendAuthError(res, error);
    }
};
