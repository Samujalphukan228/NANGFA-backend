import nodemailer from "nodemailer";
import otpGenerator from "otp-generator";
import env from "./env.js";

// Create transporter with better configuration
const transporter = nodemailer.createTransport({
    service: "Gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: env.mailUser,
        pass: env.mailPass, // Must be App Password, NOT regular password!
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Verify transporter on startup
const verifyTransporter = async () => {
    try {
        await transporter.verify();
        console.log("✅ Mail server is ready to send emails");
        return true;
    } catch (error) {
        console.error("❌ Mail server connection failed:", error.message);
        return false;
    }
};

// Call verification on module load
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
    const subjects = {
        signup: "Verify Your Email - NANGFA ETHNIC RESTAURANT",
        login: "Login Verification Code - NANGFA ETHNIC RESTAURANT",
        reset: "Password Reset Code - NANGFA ETHNIC RESTAURANT",
    };

    const mailOptions = {
        from: `"NANGFA ETHNIC RESTAURANT" <${env.mailUser}>`,
        to: email,
        subject: subjects[purpose] || "Verification Code - NANGFA",
        text: `Your OTP for ${purpose} is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\n- NANGFA Team`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
                <h2 style="color: #333;">NANGFA ETHNIC RESTAURANT</h2>
                <p>Your OTP for <strong>${purpose}</strong> is:</p>
                <h1 style="color: #007bff; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
                <p>This code will expire in <strong>10 minutes</strong>.</p>
                <hr>
                <p style="color: #666; font-size: 12px;">If you didn't request this, please ignore this email.</p>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("✅ Email sent successfully:", info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        // Log the ACTUAL error for debugging
        console.error("❌ Failed to send email:", {
            message: error.message,
            code: error.code,
            command: error.command,
            responseCode: error.responseCode
        });
        
        // Throw with more details
        throw new Error(`Failed to send OTP email: ${error.message}`);
    }
};

export { generateOTP, sendOTP, verifyTransporter };