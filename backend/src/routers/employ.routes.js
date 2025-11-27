import express from "express";
import { forgotPassword, loginEmploy, registerEmploy, resetPassword, verifyOTP, getMe } from "../controllers/employ.controller.js";

const employRouter = express.Router();

employRouter
  .post("/register", registerEmploy)
  .post("/verify-otp", verifyOTP)
  .post("/login", loginEmploy)
  .post("/forgot-password", forgotPassword)
  .post("/reset-password", resetPassword)
  .get("/me", getMe);

export default employRouter;
