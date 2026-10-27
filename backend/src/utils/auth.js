import jwt from "jsonwebtoken";
import env from "./env.js";

/** Extract the bearer token from the Authorization header. */
export const extractToken = (req) => req.headers.authorization?.split(" ")[1];

/** Verify a JWT and return its decoded payload. */
export const verifyToken = (token) => jwt.verify(token, env.jwtSecret);

/** The hard-coded admin account is identified by its email. */
export const isAdminToken = (decoded) => decoded.email === env.adminEmail;

/** Standard 401 response for invalid / expired tokens. */
export const sendAuthError = (res, error) =>
    res.status(401).json({
        success: false,
        message:
            error.name === "TokenExpiredError" ? "Token expired" : "Invalid token",
    });

/** Standard 401 response when no token was sent. */
export const sendMissingToken = (res) =>
    res.status(401).json({ success: false, message: "Not authenticated" });
