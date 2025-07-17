import { redis } from "../config/redisConfig.js";
import { prisma } from "../config/prismaConfig.js";
import { startOfToday } from "date-fns";

const LIMIT = parseInt(process.env.BASIC_DAILY_LIMIT);
console.log({LIMIT});

export const rateLimit = async (req, res, next) => {
  const userId = req.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });

  const tier = user.subscription?.subscriptionType || "basic";
  if (tier === "pro") {
    return next(); 
  }

  const today = startOfToday();

  let usage = await prisma.dailyUsage.findUnique({
    where: {
      userId_usageDate: {
        userId,
        usageDate: today,
      },
    },
  });
  if (usage && usage?.promptCount >= LIMIT ) {
    return res.status(429).json({
      error: "Daily limit reached. Upgrade to Pro for unlimited access.",
    });
  }

  // Create or update today's usage
  if (!usage) {
    await prisma.dailyUsage.create({
      data: { userId, usageDate: today, promptCount: 1 },
    });
  } else {
    await prisma.dailyUsage.update({
      where: {
        userId_usageDate: {
          userId,
          usageDate: today,
        },
      },
      data: { promptCount: { increment: 1 } },
    });
  }

  next();
};
