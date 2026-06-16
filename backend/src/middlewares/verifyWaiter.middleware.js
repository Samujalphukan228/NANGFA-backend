import jwt from "jsonwebtoken";
import env from "../utils/env.js";
import { employModel } from "../models/employ.model.js";

export const verifyWaiter = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const decoded = jwt.verify(token, env.jwtSecret);

    // Admin always passes
    if (decoded.email === env.adminEmail) {
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
      return res.status(403).json({ success: false, message: "Not authorized — waiter access required" });
    }

    // ← KEY CHECK: even approved waiters are blocked if admin toggled them off
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
    console.error("verifyWaiter error:", error);
    return res.status(401).json({
      success: false,
      message: error.name === "TokenExpiredError" ? "Token expired" : "Invalid token",
    });
  }
};