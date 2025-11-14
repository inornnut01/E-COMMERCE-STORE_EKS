import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Order from "../../../models/order.model.js";

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

describe("Order Model", () => {
  const validOrderData = {
    user: "673636363636363636363636",
    products: [
      {
        product: "673636363636363636363636",
        quantity: 1,
        price: 100,
      },
    ],
    totalAmount: 100,
    stripeSessionId: "1234567890",
  };

  describe("Order Creation", () => {
    it("should create a new order with valid data", async () => {
      const order = new Order(validOrderData);
      const savedOrder = await order.save();

      expect(savedOrder._id).toBeDefined();
      expect(savedOrder.user.toString()).toBe(validOrderData.user);
      expect(savedOrder.products).toHaveLength(validOrderData.products.length);
      expect(savedOrder.products[0].product.toString()).toBe(
        validOrderData.products[0].product
      );
      expect(savedOrder.products[0].quantity).toBe(
        validOrderData.products[0].quantity
      );
      expect(savedOrder.products[0].price).toBe(
        validOrderData.products[0].price
      );
      expect(savedOrder.totalAmount).toBe(validOrderData.totalAmount);
      expect(savedOrder.stripeSessionId).toBe(validOrderData.stripeSessionId);
      expect(savedOrder.createdAt).toBeDefined();
      expect(savedOrder.updatedAt).toBeDefined();
    });

    it("should create a new order without stripeSessionId", async () => {
      const orderData = { ...validOrderData };
      delete orderData.stripeSessionId;

      const order = new Order(orderData);
      const savedOrder = await order.save();

      expect(savedOrder._id).toBeDefined();
      expect(savedOrder.stripeSessionId).toBeUndefined();
    });
  });

  describe("Required Fields Validation", () => {
    it("should fail when user is missing", async () => {
      const orderData = { ...validOrderData };
      delete orderData.user;

      const order = new Order(orderData);
      let error;
      try {
        await order.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.user).toBeDefined();
    });

    it("should fail when totalAmount is missing", async () => {
      const orderData = { ...validOrderData };
      delete orderData.totalAmount;

      const order = new Order(orderData);
      let error;
      try {
        await order.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.totalAmount).toBeDefined();
    });

    it("should fail when product.quantity is missing", async () => {
      const orderData = {
        ...validOrderData,
        products: [
          {
            product: "673636363636363636363636",
            price: 100,
          },
        ],
      };

      const order = new Order(orderData);
      let error;
      try {
        await order.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors["products.0.quantity"]).toBeDefined();
    });

    it("should fail when product.price is missing", async () => {
      const orderData = {
        ...validOrderData,
        products: [
          {
            product: "673636363636363636363636",
            quantity: 1,
          },
        ],
      };

      const order = new Order(orderData);
      let error;
      try {
        await order.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors["products.0.price"]).toBeDefined();
    });
  });

  describe("Data Validation", () => {
    it("should fail when quantity is less than 1", async () => {
      const orderData = {
        ...validOrderData,
        products: [
          {
            product: "673636363636363636363636",
            quantity: 0,
            price: 100,
          },
        ],
      };

      const order = new Order(orderData);
      let error;
      try {
        await order.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors["products.0.quantity"]).toBeDefined();
    });

    it("should fail when price is negative", async () => {
      const orderData = {
        ...validOrderData,
        products: [
          {
            product: "673636363636363636363636",
            quantity: 1,
            price: -10,
          },
        ],
      };

      const order = new Order(orderData);
      let error;
      try {
        await order.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors["products.0.price"]).toBeDefined();
    });

    it("should fail when totalAmount is negative", async () => {
      const orderData = {
        ...validOrderData,
        totalAmount: -100,
      };

      const order = new Order(orderData);
      let error;
      try {
        await order.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.totalAmount).toBeDefined();
    });

    it("should allow totalAmount to be 0", async () => {
      const orderData = {
        ...validOrderData,
        totalAmount: 0,
      };

      const order = new Order(orderData);
      const savedOrder = await order.save();

      expect(savedOrder.totalAmount).toBe(0);
    });

    it("should allow price to be 0", async () => {
      const orderData = {
        ...validOrderData,
        products: [
          {
            product: "673636363636363636363636",
            quantity: 1,
            price: 0,
          },
        ],
      };

      const order = new Order(orderData);
      const savedOrder = await order.save();

      expect(savedOrder.products[0].price).toBe(0);
    });
  });

  describe("Unique Constraints", () => {
    it("should fail when stripeSessionId is duplicate", async () => {
      const order1 = new Order(validOrderData);
      await order1.save();

      const order2 = new Order(validOrderData);
      let error;
      try {
        await order2.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.code).toBe(11000); // MongoDB duplicate key error code
    });
  });
});
