import env from "../utils/env.js";
import { employModel } from "../models/employ.model.js";
import {
    extractToken,
    isAdminToken,
    sendAuthError,
    sendMissingToken,
    verifyToken,
} from "../utils/auth.js";

export const verifyWaiter = async (req, res, next) => {
    try {
        const token = extractToken(req);
        if (!token) return sendMissingToken(res);

        const decoded = verifyToken(token);

        // Admin always passes
        if (isAdminToken(decoded)) {
            req.admin = { _id: "admin", email: env.adminEmail, role: "admin" };
            req.userType = "admin";
            return next();
        }

        const employee = await employModel.findById(decoded.id);

        if (!employee) {
            return res.status(401).json({ success: false, message: "Account not found" });
        }

        if (!employee.isVerified) {
            return res.status(403).json({ success: false, message: "Account not verified" });
        }

        if (!employee.isAproved || employee.role !== "waiter") {
            return res.status(403).json({
                success: false,
                message: "Not authorized - waiter access required",
            });
        }

        // Even approved waiters are blocked if admin toggled them off
        if (!employee.isActive) {
            return res.status(403).json({
                success: false,
                message: "Your account has been deactivated. Contact admin.",
            });
        }

        req.employee = employee;
        req.userType = "waiter";
        return next();
    } catch (error) {
        console.error("verifyWaiter error:", error.message);
        return sendAuthError(res, error);
    }
};
