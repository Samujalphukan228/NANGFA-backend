import validator from "validator";
import argon2 from "argon2";
import env from "../utils/env.js";
import { adminModel } from "../models/admin.model.js";
import { generateOTP, sentOTP } from "../utils/mail.utils.js";
import { hashPassword } from "../utils/hashPasword.utils.js";
import { createToken } from "../utils/createToken.utils.js";


export const RegisterAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: "All fields are required" });

    if (!validator.isEmail(email))
      return res.status(400).json({ success: false, message: "Invalid email address" });

    if (password.length < 6 || password.length > 64)
      return res.status(400).json({ success: false, message: "Password must be between 6 and 64 characters" });

    if (email.toLowerCase() !== env.adminEmail.toLowerCase())
      return res.status(403).json({ success: false, message: "Forbidden: Unauthorized email" });

    const existingAdmin = await adminModel.findOne({ email: email.toLowerCase() });

    if (existingAdmin && existingAdmin.isVerified)
      return res.status(400).json({ success: false, message: "Admin already registered" });

    if (existingAdmin && !existingAdmin.isVerified)
      await adminModel.deleteOne({ email });

    const otp = generateOTP();
    const { success, hash, message } = await hashPassword(password);

    if (!success)
      return res.status(500).json({ success: false, message: "Failed to hash password", details: message });

    const admin = await adminModel.create({
      email: email.toLowerCase(),
      password: hash,
      otp,
      otpPurpose: "signup",
      otpExpires: Date.now() + 10 * 60 * 1000,
      isVerified: false,
    });

    await sentOTP(email, otp, "signup");

    setTimeout(async () => {
      try {
        const unverified = await adminModel.findOne({ email });
        if (unverified && !unverified.isVerified) {
          await adminModel.deleteOne({ email });
          console.log(`🗑️ Deleted unverified admin: ${email}`);
        }
      } catch (err) {
        console.error("Cleanup error:", err.message);
      }
    }, 10 * 60 * 1000);

    return res.status(201).json({
      success: true,
      message: "OTP sent to your email address. Please verify to complete registration.",
    });
  } catch (error) {
    console.error("RegisterAdmin error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


export const verifyAdminOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp)
      return res.status(400).json({ success: false, message: "Email and OTP are required" });

    if (!validator.isEmail(email))
      return res.status(400).json({ success: false, message: "Invalid email address" });

    if (!/^\d{6}$/.test(otp))
      return res.status(400).json({ success: false, message: "OTP must be a 6-digit number" });

    const admin = await adminModel.findOne({ email: email.toLowerCase() });
    if (!admin)
      return res.status(404).json({ success: false, message: "Admin not found" });

    if (admin.otp !== otp || admin.otpExpires < Date.now())
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

    admin.isVerified = true;
    admin.otp = undefined;
    admin.otpExpires = undefined;

    await admin.save();

    return res.status(200).json({
      success: true,
      message: "Admin verified successfully. You can now log in.",
    });
  } catch (error) {
    console.error("verifyAdminOTP error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email and password are required" });

    if (!validator.isEmail(email))
      return res.status(400).json({ success: false, message: "Invalid email address" });

    const admin = await adminModel.findOne({ email: email.toLowerCase() });
    if (!admin)
      return res.status(404).json({ success: false, message: "Admin not found" });

    if (!admin.isVerified)
      return res.status(403).json({ success: false, message: "Please verify your email before logging in" });

    const isPasswordValid = await argon2.verify(admin.password, password);
    if (!isPasswordValid)
      return res.status(401).json({ success: false, message: "Invalid password" });

    const token = createToken(admin._id);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      admin: {
        id: admin._id,
        email: admin.email,
      },
    });
  } catch (error) {
    console.error("loginAdmin error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


export const forgotAdminPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email)
      return res.status(400).json({ success: false, message: "Email is required" });

    if (!validator.isEmail(email))
      return res.status(400).json({ success: false, message: "Invalid email address" });

    const admin = await adminModel.findOne({ email: email.toLowerCase() });
    if (!admin)
      return res.status(200).json({
        success: true,
        message: "If an admin with this email exists, an OTP has been sent.",
      });

    if (admin.otpExpires && admin.otpExpires > Date.now())
      return res.status(429).json({
        success: false,
        message: "An OTP was already sent recently. Please try again later.",
      });

    const otp = generateOTP();
    admin.otp = otp;
    admin.otpExpires = Date.now() + 10 * 60 * 1000;

    await admin.save();
    await sentOTP(email, otp, "reset");

    return res.status(200).json({
      success: true,
      message: "OTP sent to your email address. Please verify to reset your password.",
    });
  } catch (error) {
    console.error("forgotAdminPassword error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


export const resetAdminPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword)
      return res.status(400).json({ success: false, message: "Email, OTP, and new password are required" });

    if (!validator.isEmail(email))
      return res.status(400).json({ success: false, message: "Invalid email address" });

    if (newPassword.length < 6 || newPassword.length > 64)
      return res.status(400).json({ success: false, message: "Password must be between 6 and 64 characters" });

    const admin = await adminModel.findOne({ email: email.toLowerCase() });
    if (!admin)
      return res.status(404).json({ success: false, message: "Admin not found" });

    if (admin.otp !== otp || admin.otpExpires < Date.now())
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

    const hashed = await hashPassword(newPassword);
    if (!hashed.success)
      return res.status(500).json({ success: false, message: "Failed to hash new password" });

    admin.password = hashed.hash;
    admin.otp = undefined;
    admin.otpExpires = undefined;

    await admin.save();

    return res.status(200).json({
      success: true,
      message: "Password has been reset successfully. You can now log in.",
    });
  } catch (error) {
    console.error("resetAdminPassword error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};