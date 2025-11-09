import dotenv from "dotenv";
import { getQueueService } from "../lib/sqs.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import connectDB from "../lib/db.js";

dotenv.config();

await connectDB();

const queueService = getQueueService();
let isShuttingDown = false;

console.log("🚀 Order Processor Worker started");
console.log(
  `📋 Processing orders from queue: ${process.env.SQS_ORDER_QUEUE_URL}`
);

const processOrder = async (message) => {
  try {
    const orderData = JSON.parse(message.Body);
    console.log(`Processing order for user: ${orderData.userId}`);

    const productIds = orderData.products.map((product) => product.id);
    const existingProducts = await Product.find({ _id: { $in: productIds } });

    if (existingProducts.length !== productIds.length) {
      throw new Error("Some product are no longer exist");
    }

    const existingOrder = await Order.findOne({
      stripeSessionId: orderData.stripeSessionId,
    });

    if (existingOrder) {
      console.log(`Order already exists: ${existingOrder._id}`);
      return { success: true, orderId: existingOrder._id };
    }

    const newOrder = new Order({
      user: orderData.userId,
      products: orderData.products.map((product) => ({
        product: product.id,
        quantity: product.quantity,
        price: product.price,
      })),
      totalAmount: orderData.totalAmount,
      stripeSessionId: orderData.stripeSessionId,
    });

    await newOrder.save();

    console.log(`Order created successfully: ${newOrder._id}`);
    return { success: true, orderId: newOrder._id };
  } catch (error) {
    console.error("Error processing order:", error);
    throw error;
  }
};

const startProcessing = async () => {
  while (!isShuttingDown) {
    try {
      const messages = await queueService.receiveMessage("orders", 10);

      if (messages.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }

      console.log(`Received ${messages.length} messages`);

      const processingPromises = messages.map(async (message) => {
        try {
          await processOrder(message);
          await queueService.deleteMesage("orders", message.ReceiptHandle);
          console.log(`Deleted message: ${message.MessageId}`);
        } catch (error) {
          console.error("Error processing order:", error);
          await queueService.deleteMesage("orders", message.ReceiptHandle);
          console.error(`Deleted message: ${message.MessageId} due to error`);
        }
      });
      await Promise.allSettled(processingPromises);
    } catch (error) {
      console.error("Error in message processing loop:", error);
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
  console.log("Order processor stopped gracefully");
  process.exit(0);
};

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  isShuttingDown = true;
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...");
  isShuttingDown = true;
});

// Start processing
startProcessing().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
