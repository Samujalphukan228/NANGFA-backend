import express from "express";
import { getCallHistory, createCallRecord, endCallRecord } from "../controllers/adminCall.controller.js";
// You'll need to create auth middleware or use existing one

const adminCallRouter = express.Router();

adminCallRouter
    .get("/history", getCallHistory)
    .post("/start", createCallRecord)
    .put("/end/:callId", endCallRecord);

export default adminCallRouter;