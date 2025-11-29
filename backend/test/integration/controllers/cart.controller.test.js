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

// Mock external service before imports
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
const { redis } = await import("../../../lib/redis.js");
const cloudinary = (await import("../../../lib/cloudinary.js")).default;
const Product = (await import("../../../models/product.model.js")).default;
const User = (await import("../../../models/user.model.js")).default;
const { getCartProducts, addToCart, removeAllFromCart, updateCartItem } =
  await import("../../../controllers/cart.controller.js");

let mongoServer;

// Helper to create mock response
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Helper to create test user with cart
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

// Helper to create test product
const createTestProduct = async (overrides = {}) => {
  const product = new Product({
    name: "Test Product",
    description: "Test Description",
    price: 100,
    image: "test-image.jpg",
    category: "test-category",
    ...overrides,
  });
  await product.save();
  return product;
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterEach(async () => {
  // Clear all collections
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

describe("Cart Controller", () => {
  describe("getCartProducts", () => {
    it("should return cart products with quantities", async () => {
      const product = await createTestProduct();

      // Mock user object matching the controller's expected structure
      // Controller uses cartItem.id === product.id for matching
      const mockUser = {
        cartItems: [
          {
            id: product._id.toString(),
            quantity: 2,
            toString: () => product._id.toString(),
            valueOf: () => product._id,
          },
        ],
      };

      const req = { user: mockUser };
      const res = mockResponse();

      await getCartProducts(req, res);

      expect(res.json).toHaveBeenCalled();
      const cartItems = res.json.mock.calls[0][0];
      expect(cartItems).toHaveLength(1);
      expect(cartItems[0].name).toBe("Test Product");
      expect(cartItems[0].quantity).toBe(2);
    });

    it("should return empty array when cart is empty", async () => {
      const user = await createTestUser([]);

      const req = { user };
      const res = mockResponse();

      await getCartProducts(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  describe("addToCart", () => {
    it("should add new product to empty cart", async () => {
      const product = await createTestProduct();
      const user = await createTestUser([]);

      const req = { body: { productId: product._id.toString() }, user };
      const res = mockResponse();

      await addToCart(req, res);

      expect(res.json).toHaveBeenCalled();
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.cartItems).toHaveLength(1);
    });

    it("should increment quantity for existing item", async () => {
      const product = await createTestProduct();
      const user = await createTestUser([
        { product: product._id, quantity: 1 },
      ]);
      const existingItemId = user.cartItems[0].id;

      const req = { body: { productId: existingItemId }, user };
      const res = mockResponse();

      await addToCart(req, res);

      expect(res.json).toHaveBeenCalled();
      await user.save();
      expect(user.cartItems[0].quantity).toBe(2);
    });
  });

  describe("removeAllFromCart", () => {
    it("should clear all cart items when no productId provided", async () => {
      const product = await createTestProduct();
      const user = await createTestUser([
        { product: product._id, quantity: 2 },
      ]);

      const req = { body: {}, user };
      const res = mockResponse();

      await removeAllFromCart(req, res);

      expect(res.json).toHaveBeenCalled();
      expect(user.cartItems).toHaveLength(0);
    });

    it("should remove specific item when productId provided", async () => {
      const product1 = await createTestProduct({ name: "Product 1" });
      const product2 = await createTestProduct({ name: "Product 2" });
      const user = await createTestUser([
        { product: product1._id, quantity: 1 },
        { product: product2._id, quantity: 1 },
      ]);
      const itemToRemoveId = user.cartItems[0].id;

      const req = { body: { productId: itemToRemoveId }, user };
      const res = mockResponse();

      await removeAllFromCart(req, res);

      expect(res.json).toHaveBeenCalled();
      expect(user.cartItems).toHaveLength(1);
    });
  });

  describe("updateCartItem", () => {
    it("should update item quantity", async () => {
      const product = await createTestProduct();
      const user = await createTestUser([
        { product: product._id, quantity: 1 },
      ]);
      const itemId = user.cartItems[0].id;

      const req = { params: { id: itemId }, body: { quantity: 5 }, user };
      const res = mockResponse();

      await updateCartItem(req, res);

      expect(res.json).toHaveBeenCalled();
      expect(user.cartItems[0].quantity).toBe(5);
    });

    it("should remove item when quantity is 0", async () => {
      const product = await createTestProduct();
      const user = await createTestUser([
        { product: product._id, quantity: 1 },
      ]);
      const itemId = user.cartItems[0].id;

      const req = { params: { id: itemId }, body: { quantity: 0 }, user };
      const res = mockResponse();

      await updateCartItem(req, res);

      expect(res.json).toHaveBeenCalled();
      expect(user.cartItems).toHaveLength(0);
    });

    it("should return 404 when item not found", async () => {
      const user = await createTestUser([]);

      const req = {
        params: { id: new mongoose.Types.ObjectId().toString() },
        body: { quantity: 1 },
        user,
      };
      const res = mockResponse();

      await updateCartItem(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Item not found in cart",
      });
    });
  });
});
