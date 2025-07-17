import { prisma } from "../../config/prismaConfig.js";
import { redis } from "../../config/redisConfig.js";
import { geminiQueue } from "../../queues/geminiQueue.js";

export const createChatroom = async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    const chatroom = await prisma.chatroom.create({
      data: { name, userId },
    });

    await redis.del(`chatrooms:user:${userId}`);

    return res.status(201).json({
      message: "Chatroom created successfully.",
      chatroom,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error." });
  }
};

export const chatroomList = async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `chatrooms:user:${userId}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ chatrooms: JSON.parse(cached), cached: true });
    }

    const chatrooms = await prisma.chatroom.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    await redis.set(cacheKey, JSON.stringify(chatrooms), "EX", 300);

    return res.status(200).json({
      message: "Chatrooms fetched successfully.",
      chatrooms,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error." });
  }
};

export const chatroomDetail = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const chatroom = await prisma.chatroom.findFirst({
      where: {
        id: Number(id),
        userId,
      },
      include: {
        messages: true,
      },
    });

    if (!chatroom)
      return res.status(404).json({
        message: "Chatroom not found",
      });

    return res.status(200).json({
      message: "Chatrooms detail fetched successfully.",
      chatroom,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error." });
  }
};

export const postMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const chatroomId = parseInt(req.params.id);
    const { content } = req.body;

    const chatroom = await prisma.chatroom.findUnique({
      where: { id: chatroomId },
    });

    if (!chatroom || chatroom.userId !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Save user message
    const userMessage = await prisma.message.create({
      data: {
        chatroomId,
        userId,
        content,
        role: "user",
      },
    });

    // Queue AI response
    await geminiQueue.add("generateResponse", {
      chatroomId,
      userId,
      userMessage: content,
    });

    return res.status(202).json({
      message: "Message received. Gemini response will follow shortly.",
      userMessage,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error." });
  }
};
