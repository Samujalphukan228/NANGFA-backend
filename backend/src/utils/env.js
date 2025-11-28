// import dotenv from "dotenv";
// dotenv.config();

// const env = {
//     port: process.env.PORT,
//     database: process.env.MONGODB_URI,
//     mailUser: process.env.EMAIL_USER,
//     mailPass: process.env.EMAIL_PASS,
//     jwtSecret: process.env.JWT_SECRET,
//     adminEmail: process.env.ADMIN_EMAIL,
//     employfrontend: process.env.FRONTEND_URL,
// }

// export default env 


// env.js
import dotenv from "dotenv";
dotenv.config();

const env = {
    port: process.env.PORT || 5000,
    mongoURI: process.env.MONGODB_URI,
    jwtSecret: process.env.JWT_SECRET,
    mailUser: process.env.EMAIL_USER,
    adminEmail: process.env.ADMIN_EMAIL,
    BREVO_API_KEY: process.env.BREVO_API_KEY,  // ✅ Add this
    BREVO_SMTP_USER: process.env.BREVO_SMTP_USER,  // Keep for reference
    nodeEnv: process.env.NODE_ENV || 'development'
};

// Debug log
console.log("🔍 Environment loaded:");
console.log("- BREVO_API_KEY:", env.BREVO_API_KEY ? `✅ ${env.BREVO_API_KEY.substring(0, 20)}...` : "❌ NOT SET");

export default env;