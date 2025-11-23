import jwt from "jsonwebtoken";
import { adminModel } from "../models/admin.model.js";
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

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Try to find admin first
    const admin = await adminModel.findById(decoded.id);
    if (admin && admin.isVerified) {
      req.admin = admin;
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

    // Neither found
    return res.status(403).json({ 
      success: false, 
      message: 'Not authorized' 
    });

  } catch (error) {
    console.error('verifyAdminOrKitchen error:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
};