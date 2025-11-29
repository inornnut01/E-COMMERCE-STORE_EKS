import {
  jest,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Import models and controller functions
const User = (await import("../../../models/user.model.js")).default;
const Product = (await import("../../../models/product.model.js")).default;
const Order = (await import("../../../models/order.model.js")).default;
const { getAnalyticsData, getDailySalesData } = await import(
  "../../../controllers/analytics.controller.js"
);

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany();
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("Analytics Controller Integration Tests", () => {
  describe("getAnalyticsData", () => {
    it("should return correct analytics with users, products, and orders", async () => {
      // Create users
      await User.create([
        { name: "User 1", email: "user1@test.com", password: "password123" },
        { name: "User 2", email: "user2@test.com", password: "password123" },
      ]);

      // Create products
      const products = await Product.create([
        {
          name: "Product 1",
          description: "Description 1",
          price: 100,
          image: "https://example.com/1.jpg",
          category: "electronics",
        },
        {
          name: "Product 2",
          description: "Description 2",
          price: 200,
          image: "https://example.com/2.jpg",
          category: "clothing",
        },
      ]);

      const user = await User.findOne({ email: "user1@test.com" });

      // Create orders
      await Order.create([
        {
          user: user._id,
          products: [{ product: products[0]._id, quantity: 1, price: 100 }],
          totalAmount: 100,
          stripeSessionId: "session_1",
        },
        {
          user: user._id,
          products: [{ product: products[1]._id, quantity: 2, price: 200 }],
          totalAmount: 400,
          stripeSessionId: "session_2",
        },
      ]);

      const result = await getAnalyticsData();

      expect(result.users).toBe(2);
      expect(result.products).toBe(2);
      expect(result.totalSales).toBe(2);
      expect(result.totalRevenue).toBe(500);
    });

    it("should return zero values when database is empty", async () => {
      const result = await getAnalyticsData();

      expect(result.users).toBe(0);
      expect(result.products).toBe(0);
      expect(result.totalSales).toBe(0);
      expect(result.totalRevenue).toBe(0);
    });

    it("should return zero sales when only users and products exist", async () => {
      await User.create({
        name: "User 1",
        email: "user1@test.com",
        password: "password123",
      });

      await Product.create({
        name: "Product 1",
        description: "Description 1",
        price: 100,
        image: "https://example.com/1.jpg",
        category: "electronics",
      });

      const result = await getAnalyticsData();

      expect(result.users).toBe(1);
      expect(result.products).toBe(1);
      expect(result.totalSales).toBe(0);
      expect(result.totalRevenue).toBe(0);
    });
  });

  describe("getDailySalesData", () => {
    it("should return daily sales data within date range", async () => {
      const user = await User.create({
        name: "User 1",
        email: "user1@test.com",
        password: "password123",
      });

      const product = await Product.create({
        name: "Product 1",
        description: "Description 1",
        price: 100,
        image: "https://example.com/1.jpg",
        category: "electronics",
      });

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Create orders with different dates
      await Order.create({
        user: user._id,
        products: [{ product: product._id, quantity: 1, price: 100 }],
        totalAmount: 100,
        stripeSessionId: "session_1",
        createdAt: today,
      });

      await Order.create({
        user: user._id,
        products: [{ product: product._id, quantity: 1, price: 150 }],
        totalAmount: 150,
        stripeSessionId: "session_2",
        createdAt: yesterday,
      });

      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 2);
      const endDate = today;

      const result = await getDailySalesData(startDate, endDate);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3); // 3 days in range

      // Check that result contains expected date format
      result.forEach((day) => {
        expect(day).toHaveProperty("date");
        expect(day).toHaveProperty("sales");
        expect(day).toHaveProperty("revenue");
      });
    });

    it("should return zero sales for dates without orders", async () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 2);

      const result = await getDailySalesData(startDate, today);

      expect(result.length).toBe(3);
      result.forEach((day) => {
        expect(day.sales).toBe(0);
        expect(day.revenue).toBe(0);
      });
    });

    it("should aggregate multiple orders on the same day", async () => {
      const user = await User.create({
        name: "User 1",
        email: "user1@test.com",
        password: "password123",
      });

      const product = await Product.create({
        name: "Product 1",
        description: "Description 1",
        price: 100,
        image: "https://example.com/1.jpg",
        category: "electronics",
      });

      const today = new Date();

      // Create multiple orders on the same day
      await Order.create([
        {
          user: user._id,
          products: [{ product: product._id, quantity: 1, price: 100 }],
          totalAmount: 100,
          stripeSessionId: "session_1",
          createdAt: today,
        },
        {
          user: user._id,
          products: [{ product: product._id, quantity: 1, price: 200 }],
          totalAmount: 200,
          stripeSessionId: "session_2",
          createdAt: today,
        },
      ]);

      const result = await getDailySalesData(today, today);

      expect(result.length).toBe(1);
      expect(result[0].sales).toBe(2);
      expect(result[0].revenue).toBe(300);
    });
  });
});
