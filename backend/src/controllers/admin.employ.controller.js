import { employModel } from "../models/employ.model.js";

/* ------------------------- GET ALL EMPLOYEES ------------------------- */
export const getAllEmployees = async (req, res) => {
  try {
    const employees = await employModel
      .find()
      .select('-password -otp -otpExpires -otpPurpose')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: employees.length,
      employees,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch employees. Please try again.",
    });
  }
};

/* ------------------------- APPROVE EMPLOYEE ------------------------- */
export const approveEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await employModel.findById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    if (!employee.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Employee must verify email first",
      });
    }

    employee.isAproved = true;
    employee.role = "kitchen";
    await employee.save();

    const io = req.app.get("io");
    if (io) {
      io.emit("employee:approved", {
        id: employee._id,
        name: employee.name,
        email: employee.email,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Employee approved successfully",
      employee: {
        id: employee._id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        isAproved: employee.isAproved,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to approve employee. Please try again.",
    });
  }
};

/* ------------------------- DELETE EMPLOYEE ------------------------- */
export const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await employModel.findById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    await employModel.findByIdAndDelete(id);

    const io = req.app.get("io");
    if (io) {
      io.emit("employee:deleted", { id });
    }

    return res.status(200).json({
      success: true,
      message: "Employee deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete employee. Please try again.",
    });
  }
};