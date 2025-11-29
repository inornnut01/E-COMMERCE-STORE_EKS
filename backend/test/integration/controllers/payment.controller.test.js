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

// Mock external services before imports
jest.unstable_mockModule("../../../lib/stripe.js", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    },
    coupons: {
      create: jest.fn(),
    },
  },
}));

jest.unstable_mockModule("../../../lib/sqs.js", () => ({
  getQueueService: jest.fn(() => ({
    sendMessage: jest.fn(),
  })),
}));

// Import after mocking
const { stripe } = await import("../../../lib/stripe.js");
const { getQueueService } = await import("../../../lib/sqs.js");
const Coupon = (await import("../../../models/coupon.model.js")).default;
const Order = (await import("../../../models/order.model.js")).default;
const User = (await import("../../../models/user.model.js")).default;
const { createCheckoutSession, checkoutSuccess } = await import(
  "../../../controllers/payment.controller.js"
);

let mongoServer;

// Helper to create mock response
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Helper to create test user
const createTestUser = async (cartItems = []) => {
  const user = new User({
    name: "Test User",
    email: `test${Date.now()}@example.com`,
    password: "password123",
    cartItems,
  });
  await user.save();
  return user;
};

// Helper to create test coupon
const createTestCoupon = async (userId, overrides = {}) => {
  const coupon = new Coupon({
    code: `TEST${Date.now()}`,
    discountPercentage: 10,
    expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    userId,
    isActive: true,
    ...overrides,
  });
  await coupon.save();
  return coupon;
};

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
  jest.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("Payment Controller", () => {
  describe("createCheckoutSession", () => {
    it("should return 400 when products array is empty", async () => {
      const user = await createTestUser();
      const req = { body: { products: [] }, user };
      const res = mockResponse();

      await createCheckoutSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid or empty products array",
      });
    });

    it("should return 400 when products is not an array", async () => {
      const user = await createTestUser();
      const req = { body: { products: "invalid" }, user };
      const res = mockResponse();

      await createCheckoutSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid or empty products array",
      });
    });

    it("should create checkout session with valid products", async () => {
      const user = await createTestUser();
      const products = [
        {
          _id: "prod1",
          name: "Test Product",
          price: 50,
          quantity: 2,
          image: "test.jpg",
        },
      ];

      stripe.checkout.sessions.create.mockResolvedValue({
        id: "session_123",
      });

      const req = { body: { products }, user };
      const res = mockResponse();

      await createCheckoutSession(req, res);

      expect(stripe.checkout.sessions.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        id: "session_123",
        totalAmount: 100,
      });
    });

    it("should apply coupon discount when valid coupon provided", async () => {
      const user = await createTestUser();
      const coupon = await createTestCoupon(user._id, {
        code: "DISCOUNT10",
        discountPercentage: 10,
      });

      const products = [
        {
          _id: "prod1",
          name: "Test Product",
          price: 100,
          quantity: 1,
          image: "test.jpg",
        },
      ];

      stripe.coupons.create.mockResolvedValue({ id: "stripe_coupon_123" });
      stripe.checkout.sessions.create.mockResolvedValue({
        id: "session_123",
      });

      const req = { body: { products, couponCode: "DISCOUNT10" }, user };
      const res = mockResponse();

      await createCheckoutSession(req, res);

      expect(stripe.coupons.create).toHaveBeenCalledWith({
        percent_off: 10,
        duration: "once",
      });
      expect(res.status).toHaveBeenCalledWith(200);
      // Total should be 100 - 10% = 90
      expect(res.json).toHaveBeenCalledWith({
        id: "session_123",
        totalAmount: 90,
      });
    });

    it("should create gift coupon when total >= $200", async () => {
      const user = await createTestUser();
      const products = [
        {
          _id: "prod1",
          name: "Expensive Product",
          price: 250,
          quantity: 1,
          image: "test.jpg",
        },
      ];

      stripe.checkout.sessions.create.mockResolvedValue({
        id: "session_123",
      });

      const req = { body: { products }, user };
      const res = mockResponse();

      await createCheckoutSession(req, res);

      expect(res.status).toHaveBeenCalledWith(200);

      // Check that gift coupon was created
      const giftCoupon = await Coupon.findOne({ userId: user._id });
      expect(giftCoupon).not.toBeNull();
      expect(giftCoupon.code).toMatch(/^GIFT/);
      expect(giftCoupon.discountPercentage).toBe(10);
    });
  });

  describe("checkoutSuccess", () => {
    it("should process successful payment and send to queue", async () => {
      const user = await createTestUser([
        { product: new mongoose.Types.ObjectId(), quantity: 1 },
      ]);
      const mockQueueService = { sendMessage: jest.fn().mockResolvedValue({}) };
      getQueueService.mockReturnValue(mockQueueService);

      const sessionId = "session_123";
      const products = [{ id: "prod1", quantity: 2, price: 50 }];

      stripe.checkout.sessions.retrieve.mockResolvedValue({
        payment_status: "paid",
        metadata: {
          userId: user._id.toString(),
          couponCode: "",
          products: JSON.stringify(products),
        },
        amount_total: 10000, // cents
      });

      const req = { body: { sessionId } };
      const res = mockResponse();

      await checkoutSuccess(req, res);

      expect(mockQueueService.sendMessage).toHaveBeenCalledWith(
        "orders",
        expect.objectContaining({
          userId: user._id.toString(),
          products,
          totalAmount: 100,
          stripeSessionId: sessionId,
        }),
        expect.objectContaining({
          orderType: "purchase",
          userId: user._id.toString(),
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message:
          "Payment successful, order created, cart cleared, and coupon deactivated if used.",
      });

      // Verify cart was cleared
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.cartItems).toHaveLength(0);
    });

    it("should deactivate coupon after successful payment", async () => {
      const user = await createTestUser();
      const coupon = await createTestCoupon(user._id, { code: "USED_COUPON" });
      const mockQueueService = { sendMessage: jest.fn().mockResolvedValue({}) };
      getQueueService.mockReturnValue(mockQueueService);

      const products = [{ id: "prod1", quantity: 1, price: 100 }];

      stripe.checkout.sessions.retrieve.mockResolvedValue({
        payment_status: "paid",
        metadata: {
          userId: user._id.toString(),
          couponCode: "USED_COUPON",
          products: JSON.stringify(products),
        },
        amount_total: 9000,
      });

      const req = { body: { sessionId: "session_123" } };
      const res = mockResponse();

      await checkoutSuccess(req, res);

      // Verify coupon was deactivated
      const updatedCoupon = await Coupon.findById(coupon._id);
      expect(updatedCoupon.isActive).toBe(false);
    });

    it("should save order directly when queue fails", async () => {
      const user = await createTestUser();
      const mockQueueService = {
        sendMessage: jest.fn().mockRejectedValue(new Error("Queue error")),
      };
      getQueueService.mockReturnValue(mockQueueService);

      const productId = new mongoose.Types.ObjectId();
      const products = [{ id: productId.toString(), quantity: 2, price: 50 }];

      stripe.checkout.sessions.retrieve.mockResolvedValue({
        payment_status: "paid",
        metadata: {
          userId: user._id.toString(),
          couponCode: "",
          products: JSON.stringify(products),
        },
        amount_total: 10000,
      });

      const req = { body: { sessionId: "session_fallback" } };
      const res = mockResponse();

      await checkoutSuccess(req, res);

      // Verify order was saved directly
      const order = await Order.findOne({
        stripeSessionId: "session_fallback",
      });
      expect(order).not.toBeNull();
      expect(order.user.toString()).toBe(user._id.toString());
      expect(order.totalAmount).toBe(100);
      expect(order.products[0].quantity).toBe(2);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
