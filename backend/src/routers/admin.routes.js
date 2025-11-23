import express from "express";
import rateLimit from "express-rate-limit";
import { forgotAdminPassword, loginAdmin, RegisterAdmin, resetAdminPassword, verifyAdminOTP } from "../controllers/admin.controller.js";


const adminRouter = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Too many login attempts. Please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: { success: false, message: "Too many password reset requests. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 3,
  message: { success: false, message: "Too many registration attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

adminRouter
  .post("/register", registerLimiter, RegisterAdmin)
  .post("/verify-otp", verifyAdminOTP)
  .post("/login", loginLimiter, loginAdmin)
  .post("/forgot-password", forgotPasswordLimiter, forgotAdminPassword)
  .post("/reset-password", resetAdminPassword);

export default adminRouter;