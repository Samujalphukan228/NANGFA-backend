import env from "../utils/env.js";
import { employModel } from "../models/employ.model.js";
import {
    extractToken,
    isAdminToken,
    sendAuthError,
    sendMissingToken,
    verifyToken,
} from "../utils/auth.js";

export const verifyAdminOrKitchen = async (req, res, next) => {
    try {
        const token = extractToken(req);
        if (!token) return sendMissingToken(res);

        const decoded = verifyToken(token);

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

        if (
            employee &&
            employee.isVerified &&
            employee.isAproved &&
            employee.role === "kitchen"
        ) {
            req.admin = { _id: employee._id };
            req.employee = employee;
            req.userType = "kitchen";
            return next();
        }

        return res.status(403).json({
            success: false,
            message: "Not authorized - admin or kitchen access required",
        });
    } catch (error) {
        console.error("verifyAdminOrKitchen error:", error.message);
        return sendAuthError(res, error);
    }
};
