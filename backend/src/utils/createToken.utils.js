import jwt from "jsonwebtoken";
import env from "./env.js";

export const createToken = (user) => {
    // If a plain ID string is passed (old usage), handle it
    if (typeof user === 'string') {
        return jwt.sign({ id: user }, env.jwtSecret, {
            expiresIn: "1d",
        });
    }

    // Full user object - include email and role
    return jwt.sign(
        {
            id: user._id || user.id,
            email: user.email,
            role: user.role
        },
        env.jwtSecret,
        { expiresIn: "1d" }
    );
};