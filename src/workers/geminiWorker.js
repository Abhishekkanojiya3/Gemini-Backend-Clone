import { Worker } from "bullmq";
import { prisma } from "../config/prismaConfig.js";
import { callGeminiAPI } from "../config/geminiConfig.js";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const geminiWorker = new Worker(
  "gemini",
  async (job) => {
    const { chatroomId, userId, userMessage } = job.data;
    console.log(job.data);
    // Gemini API call
    const geminiResponse = await callGeminiAPI(userMessage);

    // Save AI response in DB
    await prisma.message.create({
      data: {
        chatroomId,
        userId,
        content: geminiResponse,
        role: "ai",
      },
    });
  },
  {
    connection,
  }
);
