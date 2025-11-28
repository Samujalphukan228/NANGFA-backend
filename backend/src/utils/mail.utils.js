// mail.utils.js - Production-Ready Version
import nodemailer from "nodemailer";
import otpGenerator from "otp-generator";
import env from "./env.js";

console.log("📧 Initializing mail service...");
console.log("- User:", env.mailUser || "❌ NOT SET");
console.log("- Pass:", env.mailPass ? `✅ Set (${env.mailPass.length} chars)` : "❌ NOT SET");

const cleanPassword = env.mailPass?.replace(/\s/g, '');

let transporter = null;

try {
    if (!env.mailUser || !cleanPassword) {
        throw new Error("Missing email credentials");
    }
    
    // ✅ Production settings for Render/Cloud platforms
    transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,           // ✅ Use 465 instead of 587
        secure: true,        // ✅ Use SSL (required for port 465)
        auth: {
            user: env.mailUser,
            pass: cleanPassword,
        },
        connectionTimeout: 10000,  // 10 seconds
        greetingTimeout: 10000,
        socketTimeout: 15000,
    });
    
    console.log("✅ Transporter created successfully");
} catch (error) {
    console.error("❌ Failed to create transporter:", error.message);
}

// Don't verify on startup in production (saves time)
const verifyTransporter = async () => {
    if (!transporter) {
        console.error("❌ No transporter available");
        return false;
    }
    
    // Skip verification in production - just try sending
    if (process.env.NODE_ENV === 'production') {
        console.log("📧 Mail transporter ready (skipping verification in production)");
        return true;
    }
    
    try {
        await transporter.verify();
        console.log("✅ Mail server connected successfully");
        return true;
    } catch (error) {
        console.error("❌ Mail verification failed:", error.message);
        return false;
    }
};

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
        throw new Error("Email service not configured");
    }

    console.log(`📤 Sending OTP to ${email} for ${purpose}`);
    
    const subjects = {
        signup: "Verify Your Email - NANGFA",
        login: "Login Code - NANGFA",
        reset: "Password Reset Code - NANGFA",
    };

    const mailOptions = {
        from: `"NANGFA RESTAURANT" <${env.mailUser}>`,
        to: email,
        subject: subjects[purpose] || "Verification Code - NANGFA",
        text: `Your OTP is: ${otp}. Expires in 10 minutes.`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #333; text-align: center;">NANGFA RESTAURANT</h2>
                <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center;">
                    <p>Your OTP for <strong>${purpose}</strong>:</p>
                    <h1 style="color: #007bff; font-size: 32px; letter-spacing: 5px; margin: 20px 0;">${otp}</h1>
                    <p style="color: #666;">Expires in 10 minutes</p>
                </div>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("✅ Email sent:", info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error("❌ Email failed:", error.message);
        throw new Error(`Failed to send email: ${error.message}`);
    }
};

export { generateOTP, sendOTP, verifyTransporter };