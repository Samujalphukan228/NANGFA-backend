import dotenv from "dotenv";
dotenv.config();

const env = {
    port: process.env.PORT,
    database: process.env.MONGODB_URI,
    mailUser: process.env.EMAIL_USER,
    mailPass: process.env.EMAIL_PASS,
    jwtSecret: process.env.JWT_SECRET,
    adminEmail: process.env.ADMIN_EMAIL,
    employfrontend: process.env.FRONTEND_URL,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    cloudApiKey: process.env.CLOUDINARY_API_KEY,
    cloudApiSecret: process.env.CLOUDINARY_API_SECRET,
}

export default env 