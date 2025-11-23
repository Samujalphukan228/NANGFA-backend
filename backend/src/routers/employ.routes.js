import express from "express";
import rateLimit from "express-rate-limit";
import { forgotPassword, loginEmploy, registerEmploy, resetPassword, verifyOTP, getMe } from "../controllers/employ.controller.js";

const employRouter = express.Router();

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
  max: 5,
  message: { success: false, message: "Too many registration attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});


employRouter
  .post("/register", registerLimiter, registerEmploy)
  .post("/verify-otp", verifyOTP)
  .post("/login", loginLimiter, loginEmploy)
  .post("/forgot-password", forgotPasswordLimiter, forgotPassword)
  .post("/reset-password", resetPassword)
  .get("/me", getMe);

export default employRouter;