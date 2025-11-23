import { adminCallModel } from "../models/adminCall.model.js";

// Get call history
export const getCallHistory = async (req, res) => {
    try {
        const calls = await adminCallModel
            .find()
            .populate('admin', 'email')
            .populate('kitchenStaff', 'name email')
            .sort('-createdAt')
            .limit(50);

        return res.status(200).json({
            success: true,
            calls,
            count: calls.length
        });
    } catch (error) {
        console.error("getCallHistory error:", error);
        return res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};

// Create call record
export const createCallRecord = async (req, res) => {
    try {
        const { kitchenStaffId } = req.body;

        const call = await adminCallModel.create({
            admin: req.user.id, // from auth middleware
            kitchenStaff: kitchenStaffId || null,
            status: 'ongoing'
        });

        return res.status(201).json({
            success: true,
            call
        });
    } catch (error) {
        console.error("createCallRecord error:", error);
        return res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};

// End call
export const endCallRecord = async (req, res) => {
    try {
        const { callId } = req.params;

        const call = await adminCallModel.findById(callId);

        if (!call) {
            return res.status(404).json({
                success: false,
                message: "Call not found"
            });
        }

        call.endTime = new Date();
        call.status = 'completed';
        await call.save();

        return res.status(200).json({
            success: true,
            call
        });
    } catch (error) {
        console.error("endCallRecord error:", error);
        return res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};