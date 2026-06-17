import jwt from "jsonwebtoken";
import env from "./env.js";

export const createToken = (userId) => {
    return jwt.sign({ id: userId }, env.jwtSecret, {
        expiresIn: "1d",
    });
};