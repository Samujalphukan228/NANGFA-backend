// src/middlewares/verifyAdmin.middleware.js
import {
    extractToken,
    isAdminToken,
    sendAuthError,
    sendMissingToken,
    verifyToken,
} from "../utils/auth.js";

export const verifyAdmin = async (req, res, next) => {
    try {
        const token = extractToken(req);
        if (!token) return sendMissingToken(res);

        const decoded = verifyToken(token);

        if (!isAdminToken(decoded)) {
            return res.status(403).json({
                success: false,
                message: "Not authorized - admin access only",
            });
        }

        req.admin = {
            _id: decoded.id || decoded._id,
            email: decoded.email,
            role: "admin",
            isVerified: true,
        };

        return next();
    } catch (error) {
        console.error("verifyAdmin error:", error.message);
        return sendAuthError(res, error);
    }
};
