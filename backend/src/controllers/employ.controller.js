import validator from "validator";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { employModel } from "../models/employ.model.js";
import { generateOTP, sendOTP } from "../utils/mail.utils.js";  // ✅ Fixed
import { hashPassword } from "../utils/hashPasword.utils.js";
import { createToken } from "../utils/createToken.utils.js";


export const registerEmploy = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: "All fields are required" });

    if (!validator.isEmail(email))
      return res.status(400).json({ success: false, message: "Invalid email address" });

    if (password.length < 6 || password.length > 64)
      return res.status(400).json({ success: false, message: "Password must be between 6 and 64 characters" });

    const existingUser = await employModel.findOne({ email });

    if (existingUser && existingUser.isVerified)
      return res.status(400).json({ success: false, message: "Email already in use" });

    if (existingUser && !existingUser.isVerified)
      await employModel.deleteOne({ email }); 

    const otp = generateOTP();
    const { success, hash, message } = await hashPassword(password);

    if (!success)
      return res.status(500).json({ success: false, message: "Failed to hash password", details: message });

    const employ = await employModel.create({
      name: name.trim(), 
      email: email.toLowerCase(), 
      password: hash,
      otp,
      otpPurpose: "signup",
      otpExpires: Date.now() + 10 * 60 * 1000,
      isVerified: false,
    });

    await sendOTP(email, otp, "signup");  // ✅ Fixed

    setTimeout(async () => {
      try {
        const unverified = await employModel.findOne({ email });
        if (unverified && !unverified.isVerified) {
          await employModel.deleteOne({ email });
          console.log(`🗑️ Deleted unverified user: ${email}`);
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
    console.error("RegisterEmploy error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp)
      return res.status(400).json({ success: false, message: "Email and OTP are required" });

    if (!validator.isEmail(email))
      return res.status(400).json({ success: false, message: "Invalid email address" });

    if (!/^\d{6}$/.test(otp))
      return res.status(400).json({ success: false, message: "OTP must be a 6-digit number" });

    const employ = await employModel.findOne({ email: email.toLowerCase() }); 
    if (!employ)
      return res.status(404).json({ success: false, message: "Employee not found" });

    if (employ.otp !== otp || employ.otpExpires < Date.now() || employ.otpPurpose !== "signup")
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

    employ.isVerified = true;
    employ.otp = undefined;
    employ.otpPurpose = undefined;
    employ.otpExpires = undefined;

    await employ.save();


    try {
      const io = req.app.get("io");
      if (io) {
        io.to("role:admin").emit("employee:registered", {
          id: employ._id,
          name: employ.name,
          email: employ.email,
          role: employ.role || "pending",
          isVerified: true,
          managerApproved: employ.managerApproved || false,
          isAproved: employ.isAproved || false,
          createdAt: employ.createdAt
        });
        console.log(`✅ Socket: Notified admins of new employee registration - ${employ.name}`);
      } else {
        console.warn("⚠️ Socket.io instance not found");
      }
    } catch (socketError) {
      console.error("Socket emission error:", socketError);
    }

    return res.status(200).json({
      success: true,
      message: "Email verified successfully. You can now log in.",
    });
  } catch (error) {
    console.error("VerifyOTP error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const loginEmploy = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email and password are required" });

    if (typeof email !== "string" || typeof password !== "string")
      return res.status(400).json({ success: false, message: "Invalid input format" });

    if (!validator.isEmail(email))
      return res.status(400).json({ success: false, message: "Invalid email address" });

    if (password.length < 6 || password.length > 64)
      return res.status(400).json({ success: false, message: "Password must be between 6 and 64 characters" });

    if (!/^[\w!@#$%^&*()\-_=+{};:,<.>/?]+$/.test(password))
      return res.status(400).json({ success: false, message: "Password contains invalid characters" });

    const employ = await employModel.findOne({ email: email.toLowerCase() }); 
    if (!employ)
      return res.status(404).json({ success: false, message: "Employee not found" });

    if (!employ.isVerified)
      return res.status(403).json({ success: false, message: "Please verify your email before logging in" });

    const isPasswordValid = await argon2.verify(employ.password, password);
    if (!isPasswordValid)
      return res.status(401).json({ success: false, message: "Invalid password" });

    const token = createToken(employ._id);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: employ._id,
        name: employ.name,
        email: employ.email,
        role: employ.role,
        isAproved: employ.isAproved,
        isVerified: employ.isVerified,
        managerApproved: employ.managerApproved,
      },
    });
  } catch (error) {
    console.error("LoginEmploy error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email)
      return res.status(400).json({ success: false, message: "Email is required" });

    if (!validator.isEmail(email))
      return res.status(400).json({ success: false, message: "Invalid email address" });

    const employ = await employModel.findOne({ email: email.toLowerCase() }); 
    if (!employ)
      return res.status(200).json({
        success: true,
        message: "If an account with this email exists, an OTP has been sent.",
      });

    if (employ.otpPurpose === "reset" && employ.otpExpires > Date.now())
      return res.status(429).json({
        success: false,
        message: "An OTP was already sent recently. Please try again later.",
      });

    const otp = generateOTP();
    employ.otp = otp;
    employ.otpPurpose = "reset";
    employ.otpExpires = Date.now() + 10 * 60 * 1000;

    await employ.save();
    await sendOTP(email, otp, "reset");  // ✅ Fixed

    return res.status(200).json({
      success: true,
      message: "OTP sent to your email address. Please verify to reset your password.",
    });
  } catch (error) {
    console.error("ForgotPassword error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword)
      return res.status(400).json({ success: false, message: "Email, OTP, and new password are required" });

    if (!validator.isEmail(email))
      return res.status(400).json({ success: false, message: "Invalid email address" });

    if (newPassword.length < 6 || newPassword.length > 64)
      return res.status(400).json({ success: false, message: "Password must be between 6 and 64 characters" });

    if (!/^[\w!@#$%^&*()\-_=+{};:,<.>/?]+$/.test(newPassword))
      return res.status(400).json({ success: false, message: "Password contains invalid characters" });

    const employ = await employModel.findOne({ email: email.toLowerCase() });
    if (!employ)
      return res.status(404).json({ success: false, message: "Employee not found" });

    if (employ.otp !== otp || employ.otpExpires < Date.now() || employ.otpPurpose !== "reset")
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

    const hashed = await hashPassword(newPassword);
    if (!hashed.success)
      return res.status(500).json({ success: false, message: "Failed to hash new password" });

    employ.password = hashed.hash;
    employ.otp = undefined;
    employ.otpPurpose = undefined;
    employ.otpExpires = undefined;

    await employ.save();

    return res.status(200).json({
      success: true,
      message: "Password has been reset successfully. You can now log in.",
    });
  } catch (error) {
    console.error("ResetPassword error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: "No token provided" 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const employ = await employModel
      .findById(decoded.id)
      .select('-password -otp -otpExpires -otpPurpose');

    if (!employ) {
      return res.status(401).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    if (!employ.isVerified) {
      return res.status(403).json({ 
        success: false, 
        message: "Email not verified" 
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: employ._id,
        name: employ.name,
        email: employ.email,
        role: employ.role,
        isAproved: employ.isAproved,
        isVerified: employ.isVerified,
        managerApproved: employ.managerApproved,
        managerApprovedBy: employ.managerApprovedBy,
        managerApprovedAt: employ.managerApprovedAt,
        createdBy: employ.createdBy,
      },
    });
  } catch (error) {
    console.error("GetMe error:", error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid token" 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: "Token expired" 
      });
    }

    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};