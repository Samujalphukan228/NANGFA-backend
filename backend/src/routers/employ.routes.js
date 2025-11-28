// src/routers/employ.routes.js
import express from "express";
import { loginEmploy, registerEmploy, getMe } from "../controllers/employ.controller.js";

const employRouter = express.Router();

employRouter
  .post("/register", registerEmploy)
  .post("/login", loginEmploy)
  .get("/me", getMe);

export default employRouter;