import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Coupon from "../../../models/coupon.model.js";

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

describe("Coupon Model", () => {
  const validCouponData = {
    code: "SAVE20",
    discountPercentage: 20,
    expirationDate: new Date("2025-12-31"),
    userId: "673636363636363636363636",
  };

  describe("Coupon Creation", () => {
    it("should create a new coupon with valid data", async () => {
      const coupon = new Coupon(validCouponData);
      const savedCoupon = await coupon.save();

      expect(savedCoupon._id).toBeDefined();
      expect(savedCoupon.code).toBe(validCouponData.code);
      expect(savedCoupon.discountPercentage).toBe(
        validCouponData.discountPercentage
      );
      expect(savedCoupon.expirationDate).toEqual(
        validCouponData.expirationDate
      );
      expect(savedCoupon.userId.toString()).toBe(validCouponData.userId);
      expect(savedCoupon.isActive).toBe(true); // default value
      expect(savedCoupon.createdAt).toBeDefined();
      expect(savedCoupon.updatedAt).toBeDefined();
    });

    it("should set isActive to true by default", async () => {
      const coupon = new Coupon(validCouponData);
      const savedCoupon = await coupon.save();

      expect(savedCoupon.isActive).toBe(true);
    });

    it("should allow setting isActive to false", async () => {
      const couponData = { ...validCouponData, isActive: false };
      const coupon = new Coupon(couponData);
      const savedCoupon = await coupon.save();

      expect(savedCoupon.isActive).toBe(false);
    });
  });

  describe("Required Fields Validation", () => {
    it("should fail when code is missing", async () => {
      const couponData = { ...validCouponData };
      delete couponData.code;

      const coupon = new Coupon(couponData);
      let error;
      try {
        await coupon.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.code).toBeDefined();
    });

    it("should fail when discountPercentage is missing", async () => {
      const couponData = { ...validCouponData };
      delete couponData.discountPercentage;

      const coupon = new Coupon(couponData);
      let error;
      try {
        await coupon.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.discountPercentage).toBeDefined();
    });

    it("should fail when expirationDate is missing", async () => {
      const couponData = { ...validCouponData };
      delete couponData.expirationDate;

      const coupon = new Coupon(couponData);
      let error;
      try {
        await coupon.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.expirationDate).toBeDefined();
    });

    it("should fail when userId is missing", async () => {
      const couponData = { ...validCouponData };
      delete couponData.userId;

      const coupon = new Coupon(couponData);
      let error;
      try {
        await coupon.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.userId).toBeDefined();
    });
  });

  describe("Data Validation", () => {
    it("should fail when discountPercentage is less than 0", async () => {
      const couponData = {
        ...validCouponData,
        discountPercentage: -1,
      };

      const coupon = new Coupon(couponData);
      let error;
      try {
        await coupon.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.discountPercentage).toBeDefined();
    });

    it("should fail when discountPercentage is greater than 100", async () => {
      const couponData = {
        ...validCouponData,
        discountPercentage: 101,
      };

      const coupon = new Coupon(couponData);
      let error;
      try {
        await coupon.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.errors.discountPercentage).toBeDefined();
    });

    it("should allow discountPercentage to be 0", async () => {
      const couponData = {
        ...validCouponData,
        discountPercentage: 0,
      };

      const coupon = new Coupon(couponData);
      const savedCoupon = await coupon.save();

      expect(savedCoupon.discountPercentage).toBe(0);
    });

    it("should allow discountPercentage to be 100", async () => {
      const couponData = {
        ...validCouponData,
        discountPercentage: 100,
      };

      const coupon = new Coupon(couponData);
      const savedCoupon = await coupon.save();

      expect(savedCoupon.discountPercentage).toBe(100);
    });
  });

  describe("Unique Constraints", () => {
    it("should fail when code is duplicate", async () => {
      const coupon1 = new Coupon(validCouponData);
      await coupon1.save();

      const coupon2Data = {
        ...validCouponData,
        userId: "673636363636363636363637", // different userId
      };
      const coupon2 = new Coupon(coupon2Data);
      let error;
      try {
        await coupon2.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.code).toBe(11000); // MongoDB duplicate key error code
    });

    it("should fail when userId is duplicate", async () => {
      const coupon1 = new Coupon(validCouponData);
      await coupon1.save();

      const coupon2Data = {
        ...validCouponData,
        code: "SAVE30", // different code
      };
      const coupon2 = new Coupon(coupon2Data);
      let error;
      try {
        await coupon2.save();
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.code).toBe(11000); // MongoDB duplicate key error code
    });
  });
});
