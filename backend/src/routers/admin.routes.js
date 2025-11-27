import express from "express";
import { forgotAdminPassword, loginAdmin, RegisterAdmin, resetAdminPassword, verifyAdminOTP } from "../controllers/admin.controller.js";

const adminRouter = express.Router();

adminRouter
  .post("/register", RegisterAdmin)
  .post("/verify-otp", verifyAdminOTP)
  .post("/login", loginAdmin)
  .post("/forgot-password", forgotAdminPassword)
  .post("/reset-password", resetAdminPassword);

export default adminRouter;
