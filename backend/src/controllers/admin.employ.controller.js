import { employModel } from "../models/employ.model.js";

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

export const approveEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

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

    const assignedRole = role === "waiter" ? "waiter" : "kitchen";

    employee.isAproved = true;
    employee.role = assignedRole;
    employee.isActive = true; // ← always active on approval for both roles

    await employee.save();

    const io = req.app.get("io");
    if (io) {
      io.emit("employee:approved", {
        id: employee._id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        isActive: employee.isActive,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Employee approved as ${assignedRole}`,
      employee: {
        id: employee._id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        isAproved: employee.isAproved,
        isActive: employee.isActive,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to approve employee. Please try again.",
    });
  }
};

export const toggleWaiterActive = async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await employModel.findById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    if (employee.role !== "waiter") {
      return res.status(400).json({
        success: false,
        message: "This toggle is only for waiters",
      });
    }

    if (!employee.isAproved) {
      return res.status(400).json({
        success: false,
        message: "Employee must be approved first",
      });
    }

    employee.isActive = !employee.isActive;
    await employee.save();

    const io = req.app.get("io");
    if (io) {
      io.emit("employee:active-toggled", {
        id: employee._id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        isActive: employee.isActive,
      });

      if (!employee.isActive) {
        io.to("waiter").emit("waiter:deactivated", {
          message: "Your account has been deactivated by admin.",
          timestamp: Date.now(),
        });
      }
    }

    console.log(`✅ Waiter ${employee.name} set to ${employee.isActive ? "ACTIVE" : "INACTIVE"}`);

    return res.status(200).json({
      success: true,
      message: `Waiter is now ${employee.isActive ? "active" : "inactive"}`,
      employee: {
        id: employee._id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        isAproved: employee.isAproved,
        isActive: employee.isActive,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to toggle waiter status.",
    });
  }
};

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