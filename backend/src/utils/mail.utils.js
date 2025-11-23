import nodemailer from "nodemailer";
import otpGenerator from "otp-generator";
import env from "./env.js";

const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: env.mailUser,
        pass: env.mailPass,
    },
    tls: {
        rejectUnauthorized: false
    }
});

const generateOTP = () => {
    return otpGenerator.generate(6, {
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false,
        digits: true
    });
};    

const sentOTP = async (email, otp, purpose) => {
    const subjects = {
        signup: "Verify Your Email - forEver",
        login: "Login Verification Code - forEver",
        reset: "Password Reset Code - forEver",
    };

    try {
        await transporter.sendMail({
            from: `"forEver" <${env.mailUser}>`,
            to: email,
            subject: subjects[purpose] || "Verification Code - forEver",
            text: `Your OTP for ${purpose} is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\n- forEver Team`
        });
    } catch (error) {
        throw new Error("Failed to send OTP email");
    }
};

export { generateOTP, sentOTP };