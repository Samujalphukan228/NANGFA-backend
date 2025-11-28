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


import dotenv from "dotenv";
dotenv.config();

const env = {
    port: process.env.PORT || 3000, 
    database: process.env.MONGODB_URI,
    mailUser: process.env.EMAIL_USER,
    mailPass: process.env.EMAIL_PASS,
    jwtSecret: process.env.JWT_SECRET,
    adminEmail: process.env.ADMIN_EMAIL,
    employfrontend: process.env.FRONTEND_URL,
    BREVO_SMTP_USER: process.env.BREVO_SMTP_USER,
    BREVO_SMTP_KEY: process.env.BREVO_SMTP_KEY,
}

export default env;
