import { prisma } from "../../config/prismaConfig.js";
import { generateOTP, storeOTP, verifyOTP } from "../../utils/otpUtil.js";
import { generateToken } from "../../utils/jwtUtil.js";
import bcrypt from "bcryptjs";

export const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone)
      return res.status(400).json({
        error: "Phone number required.",
      });

    const otp = generateOTP();
    await storeOTP(phone, otp);
    console.log(`OTP ${otp}`);

    return res.status(200).json({
      message: "OTP sent successfully.",
      otp,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp)
      return res.status(400).json({ error: "Missing fields" });

    const isValid = await verifyOTP(phone, otp);
    if (!isValid)
      return res.status(401).json({ error: "Invalid or expired OTP" });

    let user = await prisma.user.findUnique({ where: { phone } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          passwordHash: "",
        },
      });
    }

    const token = generateToken(user);
    return res.status(200).json({
      message: "OTP verified successfully",
      user,
      token,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const phone = req.user.phone;
    const user = await prisma.user.findUnique({
      where: { phone },
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        email,
        phone,
        passwordHash: hashedPassword,
      },
    });

    const userDetails = {
      id: updatedUser.id,
      phone: updatedUser.phone,
      name: updatedUser.name,
      email: updatedUser.email,
    };
    const token = generateToken(userDetails);
    return res.status(200).json({
      message: "User details submitted successfully",
      user: updatedUser,
      token,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone)
      return res.status(400).json({
        message: "Phone number is required",
      });
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user)
      return res.status(404).json({
        error: "User not found",
      });

    const otp = generateOTP();
    await storeOTP(phone, otp);

    console.log(`OTP ${otp}`);

    return res.status(200).json({
      message: "OTP sent successfully",
      otp,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { newPassword, otp } = req.body;
    if (!newPassword || !otp)
      return res.status(400).json({ error: "Missing fields" });

    const isValid = await verifyOTP(phone, otp);
    if (!isValid)
      return res.status(401).json({ error: "Invalid or expired OTP" });

    if (!newPassword || newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: hashedPassword },
    });

    return res.status(200).json({
      message: "Password updated successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getUserDetail = async (req, res) => {
  try {
    const currentUser = req.user.id;
    const user = await prisma.user.findUnique({
      where: { id: currentUser },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "User details fetched successfully",
      user,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: error.message });
  }
};
