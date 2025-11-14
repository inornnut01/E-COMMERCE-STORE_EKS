import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Product from "../../../models/product.model.js";

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

describe("Product Model", () => {
  const validProductData = {
    name: "Product 1",
    description: "Product 1 description",
    price: 100,
    image: "https://via.placeholder.com/150",
    category: "Category 1",
    isFeatured: true,
  };

  describe("Product Creation", () => {
    it("should create a new product with valid data", async () => {
      const product = new Product(validProductData);
      const savedProduct = await product.save();

      expect(savedProduct._id).toBeDefined();
      expect(savedProduct.name).toBe(validProductData.name);
      expect(savedProduct.description).toBe(validProductData.description);
      expect(savedProduct.price).toBe(validProductData.price);
      expect(savedProduct.image).toBe(validProductData.image);
      expect(savedProduct.category).toBe(validProductData.category);
      expect(savedProduct.isFeatured).toBe(validProductData.isFeatured);
      expect(savedProduct.createdAt).toBeDefined();
      expect(savedProduct.updatedAt).toBeDefined();
    });
  });

  describe("Field Validations", () => {
    it("should fail when name is missing", async () => {
      const product = new Product({
        description: "Product 1 description",
        price: 100,
        image: "https://via.placeholder.com/150",
        category: "Category 1",
        isFeatured: true,
      });
      await expect(product.save()).rejects.toThrow();
    });

    it("should fail when description is missing", async () => {
      const product = new Product({
        name: "Product 1",
        price: 100,
        image: "https://via.placeholder.com/150",
        category: "Category 1",
        isFeatured: true,
      });
      await expect(product.save()).rejects.toThrow();
    });

    it("should fail when price is missing", async () => {
      const product = new Product({
        name: "Product 1",
        description: "Product 1 description",
        image: "https://via.placeholder.com/150",
        category: "Category 1",
        isFeatured: true,
      });
      await expect(product.save()).rejects.toThrow();
    });
    it("should fail when price is less than 0", async () => {
      const product = new Product({
        name: "Product 1",
        description: "Product 1 description",
        price: -1,
        image: "https://via.placeholder.com/150",
        category: "Category 1",
        isFeatured: true,
      });
      await expect(product.save()).rejects.toThrow();
    });
    it("should fail when image is missing", async () => {
      const product = new Product({
        name: "Product 1",
        description: "Product 1 description",
        price: 100,
        category: "Category 1",
        isFeatured: true,
      });
      await expect(product.save()).rejects.toThrow();
    });
    it("should fail when category is missing", async () => {
      const product = new Product({
        name: "Product 1",
        description: "Product 1 description",
        price: 100,
        image: "https://via.placeholder.com/150",
        isFeatured: true,
      });
      await expect(product.save()).rejects.toThrow();
    });

    it("should show isFeatured as false by default", async () => {
      const product = new Product({
        name: "Product 1",
        description: "Product 1 description",
        price: 100,
        image: "https://via.placeholder.com/150",
        category: "Category 1",
      });

      const savedProduct = await product.save();
      expect(savedProduct.isFeatured).toBe(false);
    });
  });

  describe("Type Casting Tests", () => {
    it("should cast string price to number automatically", async () => {
      const product = new Product({
        ...validProductData,
        price: "100",
      });
      const savedProduct = await product.save();
      expect(savedProduct.price).toBe(100);
    });

    it("should reject non-numeric price values", async () => {
      const product = new Product({
        ...validProductData,
        price: "abc",
      });
      await expect(product.save()).rejects.toThrow();
    });

    it("should cast number name to string automatically", async () => {
      const product = new Product({
        ...validProductData,
        name: 123,
      });
      const savedProduct = await product.save();
      expect(savedProduct.name).toBe("123");
    });
  });

  describe("Edge Cases", () => {
    it("price 0, it should be valid", async () => {
      const product = new Product({
        ...validProductData,
        price: 0,
      });
      const savedProduct = await product.save();
      expect(savedProduct.price).toBe(0);
    });
    it("Empty strings for reuired fields should be invalid", async () => {
      const product = new Product({
        name: "",
        description: "",
        price: 100,
        image: "https://via.placeholder.com/150",
        category: "Category 1",
        isFeatured: true,
      });
      await expect(product.save()).rejects.toThrow();
    });
  });
});
