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

    if (decoded.email === env.adminEmail) {
      req.admin = {
        _id: 'admin',
        email: env.adminEmail,
        role: 'admin',
        isVerified: true
      };
      req.userType = 'admin';
      return next();
    }

    const employee = await employModel.findById(decoded.id);
    
    if (employee && employee.isVerified && employee.isAproved && employee.role === 'kitchen') {
      req.admin = { _id: employee._id };
      req.employee = employee;
      req.userType = 'kitchen';
      return next();
    }

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