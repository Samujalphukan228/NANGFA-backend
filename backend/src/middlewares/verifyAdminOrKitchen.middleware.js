// src/middlewares/verifyAdminOrKitchen.middleware.js
import jwt from "jsonwebtoken";
import env from "../utils/env.js";
import { employModel } from "../models/employ.model.js";

export const verifyAdminOrKitchen = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Not authenticated' 
      });
    }

    const decoded = jwt.verify(token, env.jwtSecret);

    // Check if admin (from env)
    if (decoded.id === env.adminEmail || decoded.email === env.adminEmail) {
      req.admin = {
        _id: env.adminEmail,
        email: env.adminEmail,
        role: 'admin',
        isVerified: true
      };
      req.userType = 'admin';
      return next();
    }

    // Try to find kitchen employee
    const employee = await employModel.findById(decoded.id);
    
    if (employee && employee.isVerified && employee.isAproved && employee.role === 'kitchen') {
      req.admin = { _id: employee._id }; // For compatibility
      req.employee = employee;
      req.userType = 'kitchen';
      return next();
    }

    // Neither admin nor kitchen
    return res.status(403).json({ 
      success: false, 
      message: 'Not authorized - admin or kitchen access required' 
    });

  } catch (error) {
    console.error('verifyAdminOrKitchen error:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
};