import express from "express";
import { getCallHistory, createCallRecord, endCallRecord } from "../controllers/adminCall.controller.js";
import { verifyAdmin } from "../middlewares/verifyAdmin.middleware.js";  // ✅ Add this import

const adminCallRouter = express.Router();


adminCallRouter
    .get("/history", verifyAdmin, getCallHistory)
    .post("/start", verifyAdmin, createCallRecord)
    .put("/end/:callId", verifyAdmin, endCallRecord);

export default adminCallRouter;