import express from "express";
import { auth } from "../../middlewares/authMiddleware.js";
import {rateLimit} from "../../middlewares/rateLimitMiddleware.js"
import {
  sendOtp,
  verifyOtp,
  signup,
  forgotPassword,
  changePassword,
  getUserDetail,
} from "../../controllers/app/userController.js";
import {
  createChatroom,
  chatroomList,
  chatroomDetail,
  postMessage,
} from "../../controllers/app/chatroomController.js";

import {
  createCheckoutSession,
  stripeWebhook,
  getUserSubscriptionStatus,
} from "../../controllers/app/subscriptionController.js";

const router = express.Router();

router.post("/auth/signup", auth ,signup);
router.post("/auth/send-otp", sendOtp);
router.post("/auth/verify-otp", verifyOtp);
router.post("/auth/forgot-password", forgotPassword);
router.post("/auth/change-password", auth, changePassword);
router.get("/user/me", auth, getUserDetail);

//----------------------Chatroom-management------------------------------
router.post("/chatroom", auth, createChatroom);
router.get("/chatroom", auth, chatroomList);
router.get("/chatroom/:id", auth, chatroomDetail);

router.post(
  "/chatroom/:id/message",
  auth,
  rateLimit,
  postMessage
);

router.post("/subscribe/pro", auth, createCheckoutSession);
router.post("/webhook/stripe", express.raw({ type: "application/json" }), stripeWebhook); 
router.get("/subscription/status", auth, getUserSubscriptionStatus);

export default router;
