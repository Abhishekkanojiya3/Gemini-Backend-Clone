
app.post("/chatroom", authenticateToken, async (req, res) => {
  const { name } = req.body;
  const userId = req.user.userId;

  if (!name) {
    return res.status(400).json({
      success: false,
      error: { message: "Chatroom name is required." },
    });
  }

  try {
    const result = await pool.query(
      "INSERT INTO chatrooms (user_id, name) VALUES ($1, $2) RETURNING id, name, created_at",
      [userId, name]
    );
    // Invalidate cache for this user's chatrooms after creation
    cache.del(`chatrooms_${userId}`);
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Chatroom created successfully.",
    });
  } catch (error) {
    console.error("Error creating chatroom:", error);
    res.status(500).json({
      success: false,
      error: { message: "Internal server error creating chatroom." },
    });
  }
});

/**
 * GET /chatroom
 * Lists all chatrooms for the user (with caching).
 */
app.get("/chatroom", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const cacheKey = `chatrooms_${userId}`;
  const cachedChatrooms = cache.get(cacheKey);

  if (cachedChatrooms) {
    console.log(`Cache hit for chatrooms_${userId}`);
    return res.status(200).json({
      success: true,
      data: cachedChatrooms,
      message: "Chatrooms retrieved from cache.",
    });
  }

  console.log(`Cache miss for chatrooms_${userId}, fetching from DB.`);
  try {
    const result = await pool.query(
      "SELECT id, name, created_at FROM chatrooms WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    // Cache the result for 5 minutes (300 seconds)
    cache.set(cacheKey, result.rows, 300);
    res.status(200).json({
      success: true,
      data: result.rows,
      message: "Chatrooms retrieved successfully.",
    });
  } catch (error) {
    console.error("Error listing chatrooms:", error);
    res.status(500).json({
      success: false,
      error: { message: "Internal server error listing chatrooms." },
    });
  }
});

/**
 * GET /chatroom/:id
 * Retrieves detailed information about a specific chatroom, including messages.
 */
app.get("/chatroom/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    // Verify chatroom belongs to the user
    const chatroomResult = await pool.query(
      "SELECT id, name, created_at FROM chatrooms WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    if (chatroomResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: "Chatroom not found or unauthorized." },
      });
    }

    // Get messages for the chatroom
    const messagesResult = await pool.query(
      "SELECT id, role, content, timestamp FROM messages WHERE chatroom_id = $1 ORDER BY timestamp ASC",
      [id]
    );

    res.status(200).json({
      success: true,
      data: {
        chatroom: chatroomResult.rows[0],
        messages: messagesResult.rows,
      },
    });
  } catch (error) {
    console.error("Error retrieving chatroom details:", error);
    res.status(500).json({
      success: false,
      error: {
        message: "Internal server error retrieving chatroom details.",
      },
    });
  }
});

/**
 * POST /chatroom/:id/message
 * Sends a message and receives a Gemini response (via queue/async call).
 * Includes rate-limiting for Basic tier.
 */
app.post(
  "/chatroom/:id/message",
  authenticateToken,
  checkSubscriptionAndRateLimit,
  async (req, res) => {
    const { id: chatroomId } = req.params;
    const { content } = req.body;
    const userId = req.user.userId; // From JWT
    const subscriptionTier = req.user.subscriptionTier; // From JWT

    if (!content) {
      return res.status(400).json({
        success: false,
        error: { message: "Message content is required." },
      });
    }

    try {
      // Verify chatroom belongs to the user
      const chatroomResult = await pool.query(
        "SELECT id FROM chatrooms WHERE id = $1 AND user_id = $2",
        [chatroomId, userId]
      );
      if (chatroomResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { message: "Chatroom not found or unauthorized." },
        });
      }

      // 1. Store user's message immediately
      const userMessageResult = await pool.query(
        "INSERT INTO messages (chatroom_id, user_id, role, content) VALUES ($1, $2, $3, $4) RETURNING id, timestamp",
        [chatroomId, userId, "user", content]
      );

      // 2. Add job to BullMQ queue for Gemini API call
      // The worker will handle inserting the model's response
      await addGeminiJob({
        userMessageId: userMessageResult.rows[0].id,
        chatroomId: chatroomId,
        userId: userId,
        prompt: content,
        subscriptionTier: subscriptionTier, // Pass tier for potential future logging/different model usage
      });

      // If Basic tier, increment daily usage count
      if (subscriptionTier === "basic") {
        const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
        await pool.query(
          "INSERT INTO daily_usage (user_id, usage_date, prompt_count) VALUES ($1, $2, 1) ON CONFLICT (user_id, usage_date) DO UPDATE SET prompt_count = daily_usage.prompt_count + 1, updated_at = CURRENT_TIMESTAMP",
          [userId, today]
        );
      }

      // Respond immediately, indicating the message is accepted and AI response is pending
      res.status(202).json({
        success: true,
        data: {
          messageId: userMessageResult.rows[0].id,
          timestamp: userMessageResult.rows[0].timestamp,
          status: "accepted",
          note: "AI response will be generated shortly.",
        },
        message: "Message sent and AI processing initiated.",
      });
    } catch (error) {
      console.error("Error sending message to chatroom:", error);
      res.status(500).json({
        success: false,
        error: { message: "Internal server error sending message." },
      });
    }
  }
);

// --- 4. Subscription & Payments ---

/**
 * POST /subscribe/pro
 * Initiates a Pro subscription via Stripe Checkout.
 */
app.post("/subscribe/pro", authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    // Fetch user to get current subscription status and stripe_customer_id if exists
    const userResult = await pool.query(
      "SELECT stripe_customer_id, subscription_tier FROM users WHERE id = $1",
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: { message: "User not found." } });
    }
    const user = userResult.rows[0];

    if (user.subscription_tier === "pro") {
      return res.status(400).json({
        success: false,
        error: { message: "User is already a Pro subscriber." },
      });
    }

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      // Create a new Stripe customer if one doesn't exist for this user
      const customer = await stripe.customers.create({
        metadata: { userId: userId },
      });
      customerId = customer.id;
      // Update user in DB with new Stripe customer ID
      await pool.query(
        "UPDATE users SET stripe_customer_id = $1 WHERE id = $2",
        [customerId, userId]
      );
    }

    // Create a Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: process.env.STRIPE_PRO_PRICE_ID, // Replace with your Stripe Price ID for Pro tier
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription/cancel`,
      client_reference_id: userId, // Pass user ID to webhook
    });

    res.status(200).json({
      success: true,
      data: { checkoutUrl: session.url },
      message: "Stripe Checkout session created.",
    });
  } catch (error) {
    console.error("Error initiating Pro subscription:", error);
    res.status(500).json({
      success: false,
      error: { message: "Internal server error initiating subscription." },
    });
  }
});

/**
 * POST /webhook/stripe
 * Handles Stripe webhook events (e.g., payment success/failure).
 * This endpoint does NOT require authentication as it's called by Stripe.
 */
app.post("/webhook/stripe", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`⚠️ Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed":
      const session = event.data.object;
      const userId = session.client_reference_id;
      const customerId = session.customer;

      if (session.payment_status === "paid" && userId) {
        console.log(
          `Checkout session completed for user ${userId}. Updating subscription.`
        );
        try {
          // Update user's subscription tier to 'pro'
          await pool.query(
            "UPDATE users SET subscription_tier = $1, stripe_customer_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
            ["pro", customerId, userId]
          );
          console.log(`User ${userId} updated to Pro tier.`);
        } catch (dbError) {
          console.error(
            `Error updating user ${userId} to Pro tier in DB:`,
            dbError
          );
        }
      }
      break;
    case "customer.subscription.updated":
      // Handle subscription updates (e.g., renewal, cancellation)
      const subscriptionUpdated = event.data.object;
      console.log(
        "Subscription updated:",
        subscriptionUpdated.id,
        "Status:",
        subscriptionUpdated.status
      );
      // You might fetch the customer to get userId from metadata if not directly available
      // Or if you store subscription ID in your DB, use that to find the user.
      break;
    case "customer.subscription.deleted":
      const subscriptionDeleted = event.data.object;
      console.log("Subscription deleted:", subscriptionDeleted.id);
      // Find the user associated with this subscription and downgrade their tier to 'basic'
      try {
        const customer = await stripe.customers.retrieve(
          subscriptionDeleted.customer
        );
        const userIdFromMetadata = customer.metadata.userId;
        if (userIdFromMetadata) {
          await pool.query(
            "UPDATE users SET subscription_tier = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
            ["basic", userIdFromMetadata]
          );
          console.log(
            `User ${userIdFromMetadata} downgraded to Basic tier due to subscription deletion.`
          );
        }
      } catch (err) {
        console.error("Error handling subscription.deleted webhook:", err);
      }
      break;
    // ... handle other event types
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  res.json({ received: true });
});

/**
 * GET /subscription/status
 * Checks the user's current subscription tier (Basic or Pro).
 */
app.get("/subscription/status", authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      "SELECT subscription_tier FROM users WHERE id = $1",
      [userId]
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: { message: "User not found." } });
    }
    res.status(200).json({
      success: true,
      data: { subscriptionTier: result.rows[0].subscription_tier },
    });
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    res.status(500).json({
      success: false,
      error: {
        message: "Internal server error fetching subscription status.",
      },
    });
  }
});
