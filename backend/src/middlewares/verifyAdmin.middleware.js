// src/middlewares/verifyAdmin.middleware.js
import jwt from "jsonwebtoken";
import env from "../utils/env.js";

export const verifyAdmin = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false,
                message: 'Not authenticated' 
            });
        }

        const decoded = jwt.verify(token, env.jwtSecret);
        
        console.log("Decoded token:", decoded); // Debug - check what's in token
        console.log("ENV admin email:", env.adminEmail); // Debug - check env email

        // Check if the email in the token matches the env admin email
        if (decoded.email !== env.adminEmail) {
            return res.status(403).json({ 
                success: false,
                message: 'Not authorized - admin access only' 
            });
        }

        // Attach admin info to request
        req.admin = {
            _id: decoded.id || decoded._id,
            email: decoded.email,
            role: 'admin',
            isVerified: true
        };
        
        next();
    } catch (error) {
        console.error('verifyAdmin error:', error);
        return res.status(401).json({ 
            success: false,
            message: error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token'
        });
    }
};