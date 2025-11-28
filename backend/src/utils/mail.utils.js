// mail.utils.js - FIXED VERSION
import nodemailer from "nodemailer";
import otpGenerator from "otp-generator";
import env from "./env.js";

// Debug
console.log("📧 Initializing mail service...");
console.log("- User:", env.mailUser || "❌ NOT SET");
console.log("- Pass:", env.mailPass ? `✅ Set (${env.mailPass.length} chars)` : "❌ NOT SET");

// Clean password (remove any spaces)
const cleanPassword = env.mailPass?.replace(/\s/g, '');

// Create transporter
let transporter = null;

try {
    if (!env.mailUser || !cleanPassword) {
        throw new Error("Missing email credentials");
    }
    
    // ✅ FIXED: createTransport (NOT createTransporter)
    transporter = nodemailer.createTransport({
        service: "gmail",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
            user: env.mailUser,
            pass: cleanPassword,
        },
        tls: {
            rejectUnauthorized: false
        }
    });
    
    console.log("✅ Transporter created successfully");
} catch (error) {
    console.error("❌ Failed to create transporter:", error.message);
}

// Verify transporter
const verifyTransporter = async () => {
    if (!transporter) {
        console.error("❌ No transporter available");
        return false;
    }
    
    try {
        await transporter.verify();
        console.log("✅ Mail server connected successfully");
        console.log("✅ Ready to send emails from:", env.mailUser);
        return true;
    } catch (error) {
        console.error("❌ Mail server connection failed:");
        console.error("  Error:", error.message);
        
        if (error.message.includes("Invalid login")) {
            console.error("  💡 Fix: Check app password (no spaces!)");
        }
        return false;
    }
};

// Initialize verification
verifyTransporter();

const generateOTP = () => {
    return otpGenerator.generate(6, {
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false,
        digits: true
    });
};

const sendOTP = async (email, otp, purpose) => {
    if (!transporter) {
        throw new Error("Email service not configured. Check EMAIL_USER and EMAIL_PASS.");
    }

    console.log(`📤 Sending OTP to ${email} for ${purpose}`);
    
    const subjects = {
        signup: "Verify Your Email - NANGFA ETHNIC RESTAURANT",
        login: "Login Verification Code - NANGFA ETHNIC RESTAURANT",
        reset: "Password Reset Code - NANGFA ETHNIC RESTAURANT",
    };

    const mailOptions = {
        from: `"NANGFA ETHNIC RESTAURANT" <${env.mailUser}>`,
        to: email,
        subject: subjects[purpose] || "Verification Code - NANGFA",
        text: `Your OTP for ${purpose} is: ${otp}\n\nThis code will expire in 10 minutes.`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #333; text-align: center;">NANGFA ETHNIC RESTAURANT</h2>
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                    <p style="margin: 0 0 10px 0;">Your OTP for <strong>${purpose}</strong> is:</p>
                    <h1 style="color: #007bff; font-size: 36px; letter-spacing: 8px; text-align: center; margin: 20px 0;">${otp}</h1>
                    <p style="text-align: center; color: #666;">This code will expire in <strong>10 minutes</strong></p>
                </div>
                <p style="color: #999; font-size: 12px; text-align: center;">If you didn't request this, please ignore this email.</p>
            </div>
        `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully!");
    console.log("  Message ID:", info.messageId);
    return { success: true, messageId: info.messageId };
};

export { generateOTP, sendOTP, verifyTransporter };