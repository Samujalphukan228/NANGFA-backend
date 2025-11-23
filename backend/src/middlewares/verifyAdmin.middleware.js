import jwt from "jsonwebtoken";
import env from "../utils/env.js";
import { adminModel } from "../models/admin.model.js";



export const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await adminModel.findById(decoded.id);

    if (!admin || !admin.isVerified) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    req.admin = admin; // ✅ Make sure this exists!
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};