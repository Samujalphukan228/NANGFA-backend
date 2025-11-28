// mail.utils.js - Direct Brevo API (No SDK issues)
import otpGenerator from "otp-generator";
import env from "./env.js";

console.log("📧 Initializing Brevo API mail service...");

const apiKey = env.BREVO_API_KEY || process.env.BREVO_API_KEY;
console.log("- API Key:", apiKey ? `✅ Set (${apiKey.substring(0, 20)}...)` : "❌ NOT SET");

const verifyTransporter = async () => {
    if (!apiKey) {
        console.error("❌ No API key available");
        return false;
    }
    
    console.log("✅ Brevo API ready to send emails");
    return true;
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
    if (!apiKey) {
        throw new Error("Brevo API key not configured");
    }

    console.log(`📤 Sending OTP to ${email}`);
    console.log(`   OTP: ${otp}`);
    console.log(`   Purpose: ${purpose}`);
    
    const subjects = {
        signup: "Verify Your Email - NANGFA RESTAURANT",
        login: "Login Verification - NANGFA RESTAURANT",
        reset: "Password Reset - NANGFA RESTAURANT",
    };

    const emailPayload = {
        sender: {
            name: "NANGFA RESTAURANT",
            email: "samujalphukan15@gmail.com"
        },
        to: [
            {
                email: email,
                name: email.split('@')[0]
            }
        ],
        subject: subjects[purpose] || "Verification Code - NANGFA",
        htmlContent: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
                <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 32px;">🍜 NANGFA</h1>
                        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Ethnic Restaurant</p>
                    </div>
                    
                    <!-- Body -->
                    <div style="padding: 40px 30px;">
                        <h2 style="color: #333; text-align: center; margin: 0 0 20px 0;">Verification Code</h2>
                        <p style="color: #666; text-align: center; font-size: 16px; margin: 0 0 30px 0;">
                            Your OTP for <strong>${purpose}</strong>:
                        </p>
                        
                        <!-- OTP Box -->
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin: 0 0 30px 0;">
                            <div style="background: white; display: inline-block; padding: 15px 30px; border-radius: 8px;">
                                <span style="font-size: 42px; font-weight: bold; color: #667eea; letter-spacing: 10px; font-family: 'Courier New', monospace;">
                                    ${otp}
                                </span>
                            </div>
                        </div>
                        
                        <p style="color: #999; text-align: center; margin: 0; font-size: 14px;">
                            ⏰ This code expires in <strong style="color: #667eea;">10 minutes</strong>
                        </p>
                    </div>
                    
                    <!-- Warning -->
                    <div style="margin: 0 30px 30px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                        <p style="margin: 0; color: #856404; font-size: 13px;">
                            <strong>⚠️ Security Notice:</strong> If you didn't request this code, please ignore this email.
                        </p>
                    </div>
                    
                    <!-- Footer -->
                    <div style="padding: 20px; background: #f9f9f9; text-align: center; border-top: 1px solid #eee;">
                        <p style="margin: 0; color: #999; font-size: 12px;">
                            © ${new Date().getFullYear()} NANGFA Ethnic Restaurant. All rights reserved.
                        </p>
                    </div>
                </div>
            </body>
            </html>
        `,
        textContent: `Your OTP for ${purpose} is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\n- NANGFA Restaurant Team`
    };

    console.log("📨 Calling Brevo API...");
    console.log("   To:", email);
    console.log("   Subject:", emailPayload.subject);

    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify(emailPayload)
        });

        const responseData = await response.json();

        console.log("📬 Brevo Response:");
        console.log("   Status:", response.status);
        console.log("   Response:", JSON.stringify(responseData, null, 2));

        if (!response.ok) {
            console.error("❌ Brevo API Error!");
            console.error("   Status Code:", response.status);
            console.error("   Error Details:", responseData);
            
            if (response.status === 401) {
                throw new Error("Invalid API key - check your BREVO_API_KEY");
            } else if (response.status === 400) {
                throw new Error(`Bad request: ${responseData.message || 'Invalid email data'}`);
            } else {
                throw new Error(responseData.message || 'Failed to send email');
            }
        }

        console.log("✅ Email sent successfully via Brevo!");
        console.log("   Message ID:", responseData.messageId);

        return {
            success: true,
            messageId: responseData.messageId
        };

    } catch (error) {
        console.error("❌ Failed to send email:");
        console.error("   Error:", error.message);
        throw error;
    }
};

export { generateOTP, sendOTP, verifyTransporter };