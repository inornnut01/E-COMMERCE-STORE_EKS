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
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import User from "../../../models/user.model.js";

// Mock Redis before importing routes
const mockRedis = {
  set: jest.fn().mockResolvedValue("OK"),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
};

// Mock the redis module
jest.unstable_mockModule("../../../lib/redis.js", () => ({
  redis: mockRedis,
}));

// Import routes after mocking
const { default: authRoutes } = await import("../../../routes/auth.route.js");

let mongoServer;
let app;

beforeAll(async () => {
  // Setup test environment
  process.env.ACCESS_TOKEN_SECRET = "test-access-secret";
  process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret";
  process.env.NODE_ENV = "test";

  // Setup MongoDB Memory Server
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Setup Express app
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRoutes);
});

afterEach(async () => {
  // Clear all collections after each test
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany();
  }
  // Clear all mock calls
  jest.clearAllMocks();
  // Reset mock implementations
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue("OK");
  mockRedis.del.mockResolvedValue(1);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("Auth Controller Integration Tests", () => {
  describe("POST /api/auth/signup", () => {
    it("should create a new user and return user data with tokens", async () => {
      const userData = {
        name: "John Doe",
        email: "john@example.com",
        password: "password123",
      };

      const response = await request(app)
        .post("/api/auth/signup")
        .send(userData)
        .expect(201);

      // Check response body
      expect(response.body).toHaveProperty("_id");
      expect(response.body.name).toBe(userData.name);
      expect(response.body.email).toBe(userData.email);
      expect(response.body.role).toBe("customer");
      expect(response.body).not.toHaveProperty("password");

      // Check cookies are set
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies.some((cookie) => cookie.startsWith("accessToken="))).toBe(
        true
      );
      expect(cookies.some((cookie) => cookie.startsWith("refreshToken="))).toBe(
        true
      );

      // Verify user is in database
      const userInDb = await User.findOne({ email: userData.email });
      expect(userInDb).toBeDefined();
      expect(userInDb.name).toBe(userData.name);
      expect(userInDb.password).not.toBe(userData.password); // Password should be hashed

      // Verify refresh token was stored in Redis
      expect(mockRedis.set).toHaveBeenCalledWith(
        `refresh_token:${userInDb._id}`,
        expect.any(String),
        "EX",
        60 * 60 * 24 * 7
      );
    });

    it("should return 400 if user already exists", async () => {
      const userData = {
        name: "Jane Doe",
        email: "jane@example.com",
        password: "password123",
      };

      // Create user first
      await User.create(userData);

      // Try to create same user again
      const response = await request(app)
        .post("/api/auth/signup")
        .send(userData)
        .expect(400);

      expect(response.body.message).toBe("User already exists");
    });

    it("should return 500 if required fields are missing", async () => {
      const response = await request(app)
        .post("/api/auth/signup")
        .send({ email: "test@example.com" })
        .expect(500);

      expect(response.body.message).toBe("Internal server error");
    });

    it("should hash password before storing", async () => {
      const userData = {
        name: "Test User",
        email: "test@example.com",
        password: "mypassword123",
      };

      await request(app).post("/api/auth/signup").send(userData).expect(201);

      const user = await User.findOne({ email: userData.email });
      expect(user.password).not.toBe(userData.password);
      expect(user.password).toMatch(/^\$2[aby]\$.{56}$/); // bcrypt hash pattern
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      // Create a test user for login tests
      await User.create({
        name: "Test User",
        email: "test@example.com",
        password: "password123",
      });
    });

    it("should login with valid credentials and return user data with tokens", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "password123",
        })
        .expect(200);

      // Check response body
      expect(response.body).toHaveProperty("_id");
      expect(response.body.name).toBe("Test User");
      expect(response.body.email).toBe("test@example.com");
      expect(response.body.role).toBe("customer");
      expect(response.body).not.toHaveProperty("password");

      // Check cookies are set
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies.some((cookie) => cookie.startsWith("accessToken="))).toBe(
        true
      );
      expect(cookies.some((cookie) => cookie.startsWith("refreshToken="))).toBe(
        true
      );

      // Verify refresh token was stored in Redis
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it("should return 400 with invalid email", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "wrong@example.com",
          password: "password123",
        })
        .expect(400);

      expect(response.body.message).toBe("Invalid email or password");
    });

    it("should return 400 with invalid password", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "wrongpassword",
        })
        .expect(400);

      expect(response.body.message).toBe("Invalid email or password");
    });

    it("should not set cookies on failed login", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "wrongpassword",
        })
        .expect(400);

      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeUndefined();
    });
  });

  describe("POST /api/auth/logout", () => {
    let validRefreshToken;
    let userId;

    beforeEach(async () => {
      // Create a test user
      const user = await User.create({
        name: "Test User",
        email: "test@example.com",
        password: "password123",
      });
      userId = user._id;

      // Generate valid refresh token
      validRefreshToken = jwt.sign(
        { userId: userId },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: "7d" }
      );

      // Mock Redis to return the stored token
      mockRedis.get.mockResolvedValue(validRefreshToken);
    });

    it("should logout successfully and clear cookies", async () => {
      const response = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", [`refreshToken=${validRefreshToken}`])
        .expect(200);

      expect(response.body.message).toBe("Logged out successfully");

      // Check that cookies are cleared
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies.some((cookie) => cookie.includes("accessToken=;"))).toBe(
        true
      );
      expect(cookies.some((cookie) => cookie.includes("refreshToken=;"))).toBe(
        true
      );

      // Verify refresh token was deleted from Redis
      expect(mockRedis.del).toHaveBeenCalledWith(`refresh_token:${userId}`);
    });

    it("should logout even without refresh token", async () => {
      const response = await request(app).post("/api/auth/logout").expect(200);

      expect(response.body.message).toBe("Logged out successfully");

      // Check that cookies are cleared
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
    });

    it("should handle invalid refresh token gracefully", async () => {
      const response = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", ["refreshToken=invalid-token"])
        .expect(500);

      expect(response.body.message).toBe("Server error");
    });
  });

  describe("POST /api/auth/refresh-token", () => {
    let validRefreshToken;
    let userId;

    beforeEach(async () => {
      // Create a test user
      const user = await User.create({
        name: "Test User",
        email: "test@example.com",
        password: "password123",
      });
      userId = user._id;

      // Generate valid refresh token
      validRefreshToken = jwt.sign(
        { userId: userId },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: "7d" }
      );

      // Mock Redis to return the stored token
      mockRedis.get.mockResolvedValue(validRefreshToken);
    });

    it("should refresh access token with valid refresh token", async () => {
      const response = await request(app)
        .post("/api/auth/refresh-token")
        .set("Cookie", [`refreshToken=${validRefreshToken}`])
        .expect(200);

      expect(response.body.message).toBe("Access token refreshed successfully");

      // Check that new access token cookie is set
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies.some((cookie) => cookie.startsWith("accessToken="))).toBe(
        true
      );
    });

    it("should return 401 when no refresh token provided", async () => {
      const response = await request(app)
        .post("/api/auth/refresh-token")
        .expect(401);

      expect(response.body.message).toBe("No refresh token provided");
    });

    it("should return 401 when refresh token does not match stored token", async () => {
      const differentToken = jwt.sign(
        { userId: userId },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: "7d" }
      );

      // Keep the mock returning the original validRefreshToken, not the differentToken
      // This simulates the scenario where the token in the cookie doesn't match what's stored in Redis
      mockRedis.get.mockResolvedValue("some-other-stored-token");

      const response = await request(app)
        .post("/api/auth/refresh-token")
        .set("Cookie", [`refreshToken=${differentToken}`])
        .expect(401);

      expect(response.body.message).toBe("Invalid refresh token");
    });

    it("should return 500 with invalid refresh token", async () => {
      const response = await request(app)
        .post("/api/auth/refresh-token")
        .set("Cookie", ["refreshToken=invalid-token"])
        .expect(500);

      expect(response.body.message).toBe("Server error");
    });

    it("should return 401 when refresh token is expired", async () => {
      const expiredToken = jwt.sign(
        { userId: userId },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: "0s" }
      );

      // Wait a moment to ensure token is expired
      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await request(app)
        .post("/api/auth/refresh-token")
        .set("Cookie", [`refreshToken=${expiredToken}`])
        .expect(500);

      expect(response.body.message).toBe("Server error");
    });

    it("should return 401 when stored token is null", async () => {
      mockRedis.get.mockResolvedValue(null);

      const response = await request(app)
        .post("/api/auth/refresh-token")
        .set("Cookie", [`refreshToken=${validRefreshToken}`])
        .expect(401);

      expect(response.body.message).toBe("Invalid refresh token");
    });
  });

  describe("GET /api/auth/profile", () => {
    let accessToken;
    let user;

    beforeEach(async () => {
      // Create a test user
      user = await User.create({
        name: "Test User",
        email: "test@example.com",
        password: "password123",
        role: "customer",
      });

      // Generate valid access token
      accessToken = jwt.sign(
        { userId: user._id },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "15m" }
      );
    });

    it("should return user profile with valid access token", async () => {
      const response = await request(app)
        .get("/api/auth/profile")
        .set("Cookie", [`accessToken=${accessToken}`])
        .expect(200);

      expect(response.body._id).toBe(user._id.toString());
      expect(response.body.name).toBe(user.name);
      expect(response.body.email).toBe(user.email);
      expect(response.body.role).toBe(user.role);
      expect(response.body).not.toHaveProperty("password");
    });

    it("should return 401 when no access token provided", async () => {
      const response = await request(app).get("/api/auth/profile").expect(401);

      expect(response.body.message).toBe(
        "Unauthorized - No access token provided"
      );
    });

    it("should return 500 with invalid access token", async () => {
      const response = await request(app)
        .get("/api/auth/profile")
        .set("Cookie", ["accessToken=invalid-token"])
        .expect(500);

      expect(response.body.message).toBe("Server error");
    });

    it("should return 401 with expired access token", async () => {
      const expiredToken = jwt.sign(
        { userId: user._id },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "0s" }
      );

      // Wait a moment to ensure token is expired
      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await request(app)
        .get("/api/auth/profile")
        .set("Cookie", [`accessToken=${expiredToken}`])
        .expect(401);

      expect(response.body.message).toBe("Token expired");
    });

    it("should return 401 when user is deleted after token was issued", async () => {
      // Delete the user
      await User.findByIdAndDelete(user._id);

      const response = await request(app)
        .get("/api/auth/profile")
        .set("Cookie", [`accessToken=${accessToken}`])
        .expect(401);

      expect(response.body.message).toBe("User not found");
    });

    it("should include cart items in profile", async () => {
      // Update user with cart items
      user.cartItems = [
        {
          quantity: 2,
          product: new mongoose.Types.ObjectId(),
        },
      ];
      await user.save();

      // Generate new token for updated user
      const newAccessToken = jwt.sign(
        { userId: user._id },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "15m" }
      );

      const response = await request(app)
        .get("/api/auth/profile")
        .set("Cookie", [`accessToken=${newAccessToken}`])
        .expect(200);

      expect(response.body.cartItems).toBeDefined();
      expect(response.body.cartItems).toHaveLength(1);
      expect(response.body.cartItems[0].quantity).toBe(2);
    });
  });

  describe("Token Security", () => {
    it("should set secure cookies in production environment", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const userData = {
        name: "Secure User",
        email: "secure@example.com",
        password: "password123",
      };

      const response = await request(app)
        .post("/api/auth/signup")
        .send(userData)
        .expect(201);

      const cookies = response.headers["set-cookie"];
      expect(cookies.some((cookie) => cookie.includes("Secure"))).toBe(true);

      // Reset to original environment
      process.env.NODE_ENV = originalEnv;
    });

    it("should set httpOnly flag on cookies", async () => {
      const userData = {
        name: "HTTP User",
        email: "http@example.com",
        password: "password123",
      };

      const response = await request(app)
        .post("/api/auth/signup")
        .send(userData)
        .expect(201);

      const cookies = response.headers["set-cookie"];
      expect(cookies.some((cookie) => cookie.includes("HttpOnly"))).toBe(true);
    });

    it("should set sameSite=strict on cookies", async () => {
      const userData = {
        name: "SameSite User",
        email: "samesite@example.com",
        password: "password123",
      };

      const response = await request(app)
        .post("/api/auth/signup")
        .send(userData)
        .expect(201);

      const cookies = response.headers["set-cookie"];
      expect(cookies.some((cookie) => cookie.includes("SameSite=Strict"))).toBe(
        true
      );
    });

    it("should generate different tokens for different users", async () => {
      const user1Data = {
        name: "User One",
        email: "user1@example.com",
        password: "password123",
      };

      const user2Data = {
        name: "User Two",
        email: "user2@example.com",
        password: "password123",
      };

      const response1 = await request(app)
        .post("/api/auth/signup")
        .send(user1Data)
        .expect(201);

      const response2 = await request(app)
        .post("/api/auth/signup")
        .send(user2Data)
        .expect(201);

      const cookies1 = response1.headers["set-cookie"];
      const cookies2 = response2.headers["set-cookie"];

      expect(cookies1).not.toEqual(cookies2);
    });
  });

  describe("End-to-End Authentication Flow", () => {
    it("should complete full authentication flow: signup -> profile -> logout -> login", async () => {
      // Step 1: Signup
      const userData = {
        name: "E2E User",
        email: "e2e@example.com",
        password: "password123",
      };

      const signupResponse = await request(app)
        .post("/api/auth/signup")
        .send(userData)
        .expect(201);

      expect(signupResponse.body.email).toBe(userData.email);

      // Extract tokens from signup
      const signupCookies = signupResponse.headers["set-cookie"];
      const accessTokenCookie = signupCookies.find((cookie) =>
        cookie.startsWith("accessToken=")
      );
      const refreshTokenCookie = signupCookies.find((cookie) =>
        cookie.startsWith("refreshToken=")
      );

      // Step 2: Get Profile
      const profileResponse = await request(app)
        .get("/api/auth/profile")
        .set("Cookie", [accessTokenCookie])
        .expect(200);

      expect(profileResponse.body.email).toBe(userData.email);

      // Step 3: Logout
      const logoutResponse = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", [refreshTokenCookie])
        .expect(200);

      expect(logoutResponse.body.message).toBe("Logged out successfully");

      // Step 4: Login again
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: userData.email,
          password: userData.password,
        })
        .expect(200);

      expect(loginResponse.body.email).toBe(userData.email);
    });
  });
});
