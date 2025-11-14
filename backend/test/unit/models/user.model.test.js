import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../../../models/user.model.js";

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

describe("User Model", () => {
  const validUserData = {
    name: "John Doe",
    email: "john.doe@example.com",
    password: "password123",
  };

  describe("User Creation", () => {
    it("should create a new user with valid data", async () => {
      const user = new User(validUserData);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect(savedUser.name).toBe(validUserData.name);
      expect(savedUser.email).toBe(validUserData.email);
      expect(savedUser.password).not.toBe(validUserData.password); // Password should be hashed
      expect(savedUser.role).toBe("customer"); // Default role
      expect(savedUser.cartItems).toEqual([]); // Empty cart by default
      expect(savedUser.createdAt).toBeDefined();
      expect(savedUser.updatedAt).toBeDefined();
    });

    it("should convert email to lowercase", async () => {
      const user = new User({
        ...validUserData,
        email: "JOHN@EXAMPLE.COM",
      });
      const savedUser = await user.save();

      expect(savedUser.email).toBe("john@example.com");
    });

    it("should trim email whitespace", async () => {
      const user = new User({
        ...validUserData,
        email: "   john.doe@example.com   ",
      });
      const savedUser = await user.save();

      expect(savedUser.email).toBe("john.doe@example.com");
    });

    it("should set role to admin when specified", async () => {
      const user = new User({
        ...validUserData,
        role: "admin",
      });
      const savedUser = await user.save();
      expect(savedUser.role).toBe("admin");
    });

    describe("Field Validations", () => {
      it("should fail when name is missing", async () => {
        const user = new User({
          email: "john@example.com",
          password: "password123",
        });

        await expect(user.save()).rejects.toThrow();
      });

      it("should fail when email is missing", async () => {
        const user = new User({
          name: "John Doe",
          password: "password123",
        });

        await expect(user.save()).rejects.toThrow();
      });

      it("should fail when password is missing", async () => {
        const user = new User({
          name: "John Doe",
          email: "john@example.com",
        });

        await expect(user.save()).rejects.toThrow();
      });

      it("should fail when password is less than 6 characters", async () => {
        const user = new User({
          ...validUserData,
          password: "12345",
        });

        await expect(user.save()).rejects.toThrow();
      });

      it("should fail when email is not unique", async () => {
        const user1 = new User(validUserData);
        await user1.save();

        const user2 = new User(validUserData);
        await expect(user2.save()).rejects.toThrow();
      });

      it("should fail when role is invalid", async () => {
        const user = new User({
          ...validUserData,
          role: "superuser",
        });

        await expect(user.save()).rejects.toThrow();
      });
    });

    describe("Password Hashing", () => {
      it("should hash password before saving", async () => {
        const user = new User(validUserData);
        const savedUser = await user.save();

        expect(savedUser.password).not.toBe(validUserData.password);
        expect(savedUser.password).toHaveLength(60); // bcrypt hash length
        expect(
          savedUser.password.startsWith("$2a$") ||
            savedUser.password.startsWith("$2b$")
        ).toBe(true);
      });

      it("should not rehash password if not modified", async () => {
        const user = new User(validUserData);
        const savedUser = await user.save();
        const originalHash = savedUser.password;

        // Update name without changing password
        savedUser.name = "Jane Doe";
        await savedUser.save();

        expect(savedUser.password).toBe(originalHash);
      });

      it("should rehash password when modified", async () => {
        const user = new User(validUserData);
        const savedUser = await user.save();
        const originalHash = savedUser.password;

        // Update password
        savedUser.password = "newpassword123";
        await savedUser.save();

        expect(savedUser.password).not.toBe(originalHash);
      });
    });

    describe("comparePassword Method", () => {
      it("should return true for correct password", async () => {
        const user = new User(validUserData);
        await user.save();

        const isMatch = await user.comparePassword("password123");
        expect(isMatch).toBe(true);
      });

      it("should return false for incorrect password", async () => {
        const user = new User(validUserData);
        await user.save();

        const isMatch = await user.comparePassword("wrongpassword");
        expect(isMatch).toBe(false);
      });
    });

    describe("Cart Items", () => {
      it("should add items to cart", async () => {
        const user = new User(validUserData);
        user.cartItems.push({
          product: new mongoose.Types.ObjectId(),
          quantity: 2,
        });
        const savedUser = await user.save();

        expect(savedUser.cartItems).toHaveLength(1);
        expect(savedUser.cartItems[0].quantity).toBe(2);
        expect(savedUser.cartItems[0].product).toBeDefined();
      });

      it("should set default quantity to 1", async () => {
        const user = new User(validUserData);
        user.cartItems.push({
          product: new mongoose.Types.ObjectId(),
        });
        const savedUser = await user.save();

        expect(savedUser.cartItems[0].quantity).toBe(1);
      });
    });
  });
});
