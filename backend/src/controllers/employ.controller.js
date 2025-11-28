// src/controllers/employ.controller.js
import validator from "validator";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { employModel } from "../models/employ.model.js";
import { hashPassword } from "../utils/hashPasword.utils.js";
import { createToken } from "../utils/createToken.utils.js";

// ✅ Register without OTP - direct verification
export const registerEmploy = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: "All fields are required" });

    if (!validator.isEmail(email))
      return res.status(400).json({ success: false, message: "Invalid email address" });

    if (password.length < 6 || password.length > 64)
      return res.status(400).json({ success: false, message: "Password must be between 6 and 64 characters" });

    const existingUser = await employModel.findOne({ email: email.toLowerCase() });

    if (existingUser)
      return res.status(400).json({ success: false, message: "Email already in use" });

    const { success, hash, message } = await hashPassword(password);

    if (!success)
      return res.status(500).json({ success: false, message: "Failed to hash password", details: message });

    const employ = await employModel.create({
      name: name.trim(),
      email: email.toLowerCase(),
      password: hash,
      isVerified: true,  // ✅ Auto-verify or set to false if admin approval needed
      role: "pending",   // Admin will approve later
      isAproved: false,
    });

    // ✅ Notify admin via socket
    try {
      const io = req.app.get("io");
      if (io) {
        io.to("role:admin").emit("employee:registered", {
          id: employ._id,
          name: employ.name,
          email: employ.email,
          role: employ.role,
          isVerified: true,
          isAproved: false,
          createdAt: employ.createdAt
        });
        console.log(`✅ Socket: Notified admins of new employee registration - ${employ.name}`);
      }
    } catch (socketError) {
      console.error("Socket emission error:", socketError);
    }

    return res.status(201).json({
      success: true,
      message: "Registration successful. Waiting for admin approval.",
      user: {
        id: employ._id,
        name: employ.name,
        email: employ.email,
        role: employ.role
      }
    });
  } catch (error) {
    console.error("RegisterEmploy error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ❌ Remove verifyOTP - not needed anymore
// export const verifyOTP = async (req, res) => { ... };

// ✅ Login - simplified
export const loginEmploy = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email and password are required" });

    if (!validator.isEmail(email))
      return res.status(400).json({ success: false, message: "Invalid email address" });

    const employ = await employModel.findOne({ email: email.toLowerCase() });
    if (!employ)
      return res.status(404).json({ success: false, message: "Employee not found" });

    if (!employ.isVerified)
      return res.status(403).json({ success: false, message: "Account not verified. Contact admin." });

    if (!employ.isAproved)
      return res.status(403).json({ success: false, message: "Account pending admin approval" });

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
      },
    });
  } catch (error) {
    console.error("LoginEmploy error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ❌ Remove forgotPassword - not using OTP
// export const forgotPassword = async (req, res) => { ... };

// ❌ Remove resetPassword - not using OTP
// export const resetPassword = async (req, res) => { ... };

// ✅ Get current user info
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
      .select('-password');

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