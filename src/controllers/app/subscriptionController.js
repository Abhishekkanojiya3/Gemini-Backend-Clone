import Stripe from "stripe";
import { prisma } from "../../config/prismaConfig.js";
import { startOfToday } from "date-fns";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION,
});

export const createCheckoutSession = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (user?.subscription?.subscriptionType === "pro") {
      return res
        .status(400)
        .json({ message: "You already have a Pro subscription." });
    }
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: userId.toString() },
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer: customer.id,
      line_items: [
        {
          price_data: {
            currency: "inr", //INR
            product_data: {
              name: "Gemini Pro Subscription",
            },
            unit_amount: 49900, // ₹499 → Multiply by 100
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.STRIPE_CANCEL_URL,
      metadata: {
        userId: String(userId),
      },
    });
    const today = startOfToday();
    await prisma.subscription.upsert({
      where: { userId },
      update: { stripeSubId: session.id },
      create: {
        userId,
        stripeSubId: session.id,
        subscriptionType: "basic",
        stripeCustomerId: customer.id,
        status: "active",
        startedAt: today,
      },
    });

    res.status(201).json({
      message: "Strip checkout session created successfully.",
      url: session.url,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create Stripe session" });
  }
};

export const stripeWebhook = async (req, res) => {
  try {
    const sig = req.headers["stripe-signature"];
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error("Webhook Signature Error:", error.message);
      return res.status(400).json({
        message: `Webhook Signature Error.`,
      });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = parseInt(session.metadata.userId);

      await prisma.subscription.update({
        where: { userId },
        data: { subscriptionType: "pro" },
      });
    }

    res.status(200).json({
      message: "payment successfully received.",
      received: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getUserSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      return res
        .status(200)
        .json({ message: "User current subscription tier is basic" });
    }

    return res.status(200).json({
      message: "User current subscription tier",
      subscriptionTier: subscription.subscriptionType,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
