import argon2 from "argon2";

export const hashPassword = async (password) => {
    try {
        const hash = await argon2.hash(password);
        return { success: true, hash };
    } catch (error) {
        console.error(error);
        return { success: false, message: error.message };
    }
};