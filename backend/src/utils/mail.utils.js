// mail.utils.js - Use verified Brevo sender
import nodemailer from "nodemailer";
import otpGenerator from "otp-generator";
import env from "./env.js";

console.log("📧 Initializing Brevo mail service...");
console.log("- SMTP User:", env.BREVO_SMTP_USER || "❌ NOT SET");
console.log("- SMTP Key:", env.BREVO_SMTP_KEY ? "✅ Set" : "❌ NOT SET");

let transporter = null;

try {
    transporter = nodemailer.createTransport({
        host: "smtp-relay.brevo.com",
        port: 587,
        secure: false,
        auth: {
            user: env.BREVO_SMTP_USER || process.env.BREVO_SMTP_USER,
            pass: env.BREVO_SMTP_KEY || process.env.BREVO_SMTP_KEY,
        },
        tls: {
            rejectUnauthorized: false
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
    });
    
    console.log("✅ Brevo transporter created successfully");
} catch (error) {
    console.error("❌ Failed to create transporter:", error.message);
}

const verifyTransporter = async () => {
    if (!transporter) {
        console.error("❌ No transporter available");
        return false;
    }
    
    try {
        await transporter.verify();
        console.log("✅ Brevo SMTP server connected successfully");
        console.log("✅ Ready to send emails via Brevo");
        return true;
    } catch (error) {
        console.error("❌ Brevo connection failed:", error.message);
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
        signup: "Verify Your Email - NANGFA RESTAURANT",
        login: "Login Verification Code - NANGFA RESTAURANT",
        reset: "Password Reset Code - NANGFA RESTAURANT",
    };

    const mailOptions = {
        // ✅ FIX: Use your actual Brevo account email as sender
        from: '"NANGFA RESTAURANT" <samujalphukan15@gmail.com>',  // Change this!
        replyTo: 'samujalphukan15@gmail.com',
        to: email,
        subject: subjects[purpose] || "Verification Code - NANGFA",
        text: `Your OTP for ${purpose} is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
                    <h1 style="color: white; margin: 0; font-size: 28px;">🍜 NANGFA RESTAURANT</h1>
                </div>
                
                <div style="background: #f9f9f9; padding: 30px; border-radius: 10px; text-align: center;">
                    <h2 style="color: #333; margin: 0 0 20px 0;">Verification Code</h2>
                    <p style="color: #666; margin: 0 0 30px 0;">Your OTP for <strong>${purpose}</strong>:</p>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; display: inline-block; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h1 style="color: #667eea; font-size: 48px; letter-spacing: 12px; margin: 0; font-weight: bold;">${otp}</h1>
                    </div>
                    
                    <p style="color: #999; margin: 30px 0 0 0; font-size: 14px;">
                        ⏰ This code expires in <strong>10 minutes</strong>
                    </p>
                </div>
                
                <div style="margin-top: 30px; padding: 20px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                    <p style="margin: 0; color: #856404; font-size: 13px;">
                        <strong>⚠️ Security Notice:</strong> If you didn't request this code, please ignore this email. 
                        Never share this code with anyone.
                    </p>
                </div>
                
                <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                    <p style="color: #999; font-size: 12px; margin: 0;">
                        © ${new Date().getFullYear()} NANGFA Ethnic Restaurant. All rights reserved.
                    </p>
                </div>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("✅ Email sent successfully via Brevo!");
        console.log("  Message ID:", info.messageId);
        console.log("  Response:", info.response);
        console.log("  Accepted:", info.accepted);
        console.log("  Rejected:", info.rejected);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error("❌ Failed to send email:", error.message);
        console.error("  Full error:", error);
        throw new Error(`Email sending failed: ${error.message}`);
    }
};

export { generateOTP, sendOTP, verifyTransporter };