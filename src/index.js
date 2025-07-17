import dotenv from "dotenv";
dotenv.config();
import express from "express";
import morgan from "morgan";
import setupRoutes from "./routes/index.js";
import cors from "cors";
import { stripeWebhook } from "./controllers/app/subscriptionController.js"; // adjust path accordingly
 
const app = express();
app.use(
  "/api/webhook/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook
);


app.use(morgan("dev"));
app.use(express.json());

setupRoutes(app);
app.use(
  cors({
    origin: ["http://localhost:3000"],
  })
);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
