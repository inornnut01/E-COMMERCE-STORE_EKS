import {
  jest,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import {
  protectRoute,
  adminRoute,
} from "../../../middleware/auth.middleware.js";
import User from "../../../models/user.model.js";

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  process.env.ACCESS_TOKEN_SECRET = "test-secret-key";
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

describe("Auth Middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      cookies: {},
      user: null,
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe("protectRoute", () => {
    it("should call next() when valid token and user exists", async () => {
      // Create a real user in the database
      const user = new User({
        name: "John Doe",
        email: "john@example.com",
        password: "password123",
      });
      await user.save();

      // Create a valid token
      const token = jwt.sign(
        { userId: user._id },
        process.env.ACCESS_TOKEN_SECRET
      );
      req.cookies.accessToken = token;

      await protectRoute(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.email).toBe("john@example.com");
      expect(req.user.password).toBeUndefined(); // Should exclude password
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
    it("should return 401 when no access token provided", async () => {
      req.cookies.accessToken = undefined;

      await protectRoute(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: "Unauthorized - No access token provided",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 when user not found", async () => {
      // Create token with non-existent user ID
      const fakeUserId = new mongoose.Types.ObjectId();
      const token = jwt.sign(
        { userId: fakeUserId },
        process.env.ACCESS_TOKEN_SECRET
      );
      req.cookies.accessToken = token;

      await protectRoute(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "User not found" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 when token is invalid", async () => {
      req.cookies.accessToken = "invalid-token";

      await protectRoute(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Server error",
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 when token is expired", async () => {
      const user = new User({
        name: "John Doe",
        email: "john2@example.com",
        password: "password123",
      });
      await user.save();

      // Create expired token
      const token = jwt.sign(
        { userId: user._id },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "0s" }
      );
      req.cookies.accessToken = token;

      // Wait a moment to ensure token is expired
      await new Promise((resolve) => setTimeout(resolve, 100));

      await protectRoute(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Token expired" });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("adminRoute", () => {
    it("should call next() when user is admin", () => {
      req.user = { role: "admin", name: "Admin User" };

      adminRoute(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 403 when user is not admin", () => {
      req.user = { role: "customer", name: "Regular User" };

      adminRoute(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Access denied - Admin only",
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
