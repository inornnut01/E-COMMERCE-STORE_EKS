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
jest.unstable_mockModule("../../../lib/redis.js", () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.unstable_mockModule("../../../lib/cloudinary.js", () => ({
  default: {
    uploader: {
      upload: jest.fn(),
      destroy: jest.fn(),
    },
  },
}));

// Import after mocking
const Coupon = (await import("../../../models/coupon.model.js")).default;
const User = (await import("../../../models/user.model.js")).default;
const { getCoupons, validateCoupon } = await import(
  "../../../controllers/coupon.controller.js"
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
const createTestUser = async () => {
  const user = new User({
    name: "Test User",
    email: `test${Date.now()}@example.com`,
    password: "password123",
  });
  await user.save();
  return user;
};

// Helper to create test coupon
const createTestCoupon = async (userId, overrides = {}) => {
  const coupon = new Coupon({
    code: `TESTCODE${Date.now()}`,
    discountPercentage: 10,
    expirationDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    isActive: true,
    userId,
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

describe("Coupon Controller", () => {
  describe("getCoupons", () => {
    it("should return active coupon for user", async () => {
      const user = await createTestUser();
      const coupon = await createTestCoupon(user._id);

      const req = { user: { _id: user._id } };
      const res = mockResponse();

      await getCoupons(req, res);

      expect(res.json).toHaveBeenCalled();
      const result = res.json.mock.calls[0][0];
      expect(result.code).toBe(coupon.code);
      expect(result.discountPercentage).toBe(10);
    });

    it("should return null when user has no coupon", async () => {
      const user = await createTestUser();

      const req = { user: { _id: user._id } };
      const res = mockResponse();

      await getCoupons(req, res);

      expect(res.json).toHaveBeenCalledWith(null);
    });

    it("should return null when coupon is inactive", async () => {
      const user = await createTestUser();
      await createTestCoupon(user._id, { isActive: false });

      const req = { user: { _id: user._id } };
      const res = mockResponse();

      await getCoupons(req, res);

      expect(res.json).toHaveBeenCalledWith(null);
    });
  });

  describe("validateCoupon", () => {
    it("should validate active coupon successfully", async () => {
      const user = await createTestUser();
      const coupon = await createTestCoupon(user._id);

      const req = {
        body: { code: coupon.code },
        user: { _id: user._id },
      };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: "Coupon is valid",
        code: coupon.code,
        discountPercentage: coupon.discountPercentage,
      });
    });

    it("should return 404 for non-existent coupon", async () => {
      const user = await createTestUser();

      const req = {
        body: { code: "INVALID_CODE" },
        user: { _id: user._id },
      };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Coupon not found" });
    });

    it("should return 400 for expired coupon", async () => {
      const user = await createTestUser();
      const coupon = await createTestCoupon(user._id, {
        expirationDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      });

      const req = {
        body: { code: coupon.code },
        user: { _id: user._id },
      };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Coupon has expired" });

      // Verify coupon was deactivated
      const updatedCoupon = await Coupon.findById(coupon._id);
      expect(updatedCoupon.isActive).toBe(false);
    });

    it("should return 404 for another user's coupon", async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const coupon = await createTestCoupon(user1._id);

      const req = {
        body: { code: coupon.code },
        user: { _id: user2._id },
      };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Coupon not found" });
    });
  });
});
