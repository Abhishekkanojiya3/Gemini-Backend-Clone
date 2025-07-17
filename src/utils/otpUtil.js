import {redis} from "../config/redisConfig.js"


export const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

export const storeOTP = async (phone, otp) => {
  await redis.set(`otp:${phone}`, otp, "EX", 300);

};

export const verifyOTP = async (phone, otp) => {
  const saved = await redis.get(`otp:${phone}`);
  return saved === otp;
};
