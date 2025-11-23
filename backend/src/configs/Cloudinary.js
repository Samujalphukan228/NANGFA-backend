import { v2 as cloudinary } from "cloudinary";
import env from "../utils/env.js";

export const connectCloudinary = async () => {
    cloudinary.config({
    cloud_name: env.cloudName,
    api_key: env.cloudApiKey,
    api_secret: env.cloudApiSecret,
  });

  console.log("✅ Cloudinary connected");
}