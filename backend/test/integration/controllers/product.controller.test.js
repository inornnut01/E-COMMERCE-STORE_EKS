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
const { redis } = await import("../../../lib/redis.js");
const cloudinary = (await import("../../../lib/cloudinary.js")).default;
const Product = (await import("../../../models/product.model.js")).default;
const {
  getAllProducts,
  getFeaturedProducts,
  createProduct,
  deleteProduct,
  getRecommendedProducts,
  getProductsByCategory,
  toggleFeaturedProduct,
} = await import("../../../controllers/product.controller.js");

let mongoServer;

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

describe("Product Controller Integration Tests", () => {
  let req, res;
  let consoleLogSpy;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe("getAllProducts", () => {
    it("should return all products from database", async () => {
      // Create real products in database
      await Product.create([
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

      await getAllProducts(req, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.products).toHaveLength(2);
      expect(response.products[0].name).toBe("Product 1");
      expect(response.products[1].name).toBe("Product 2");
    });

    it("should return empty array when no products exist", async () => {
      await getAllProducts(req, res);

      expect(res.json).toHaveBeenCalledWith({ products: [] });
    });

    it("should handle database errors", async () => {
      // Force an error by closing the connection temporarily
      await mongoose.connection.close();

      await getAllProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Server error",
        })
      );

      // Reconnect for other tests
      await mongoose.connect(mongoServer.getUri());
    });
  });

  describe("getFeaturedProducts", () => {
    it("should return cached featured products from Redis", async () => {
      const mockProducts = [
        { name: "Featured 1", price: 100, isFeatured: true },
      ];
      redis.get.mockResolvedValue(JSON.stringify(mockProducts));

      await getFeaturedProducts(req, res);

      expect(redis.get).toHaveBeenCalledWith("featured_products");
      expect(res.json).toHaveBeenCalledWith(mockProducts);
    });

    it("should fetch from database and cache when not in Redis", async () => {
      redis.get.mockResolvedValue(null);

      // Create featured products in database
      const featuredProduct = await Product.create({
        name: "Featured Product",
        description: "Featured Description",
        price: 150,
        image: "https://example.com/featured.jpg",
        category: "electronics",
        isFeatured: true,
      });

      await getFeaturedProducts(req, res);

      expect(redis.get).toHaveBeenCalledWith("featured_products");
      expect(redis.set).toHaveBeenCalled();

      const response = res.json.mock.calls[0][0];
      expect(response).toHaveLength(1);
      expect(response[0].name).toBe("Featured Product");
      expect(response[0].isFeatured).toBe(true);
    });

    it("should return empty array when no featured products exist", async () => {
      redis.get.mockResolvedValue(null);

      // Create non-featured product
      await Product.create({
        name: "Regular Product",
        description: "Regular Description",
        price: 100,
        image: "https://example.com/regular.jpg",
        category: "electronics",
        isFeatured: false,
      });

      await getFeaturedProducts(req, res);

      // When array is empty, it returns empty array (not 404)
      // The 404 only happens when the result is explicitly null
      const response = res.json.mock.calls[0][0];
      expect(Array.isArray(response)).toBe(true);
      expect(response).toHaveLength(0);
    });
  });

  describe("createProduct", () => {
    it("should create product with image upload", async () => {
      req.body = {
        name: "New Product",
        description: "New Description",
        price: 100,
        category: "electronics",
        image: "base64imagestring",
      };

      cloudinary.uploader.upload.mockResolvedValue({
        secure_url: "https://cloudinary.com/image.jpg",
      });

      await createProduct(req, res);

      expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
        "base64imagestring",
        { folder: "products" }
      );
      expect(res.status).toHaveBeenCalledWith(201);

      const response = res.json.mock.calls[0][0];
      expect(response.name).toBe("New Product");
      expect(response.image).toBe("https://cloudinary.com/image.jpg");

      // Verify product was created in database
      const product = await Product.findOne({ name: "New Product" });
      expect(product).toBeDefined();
      expect(product.price).toBe(100);
    });

    it("should fail validation when required fields are missing", async () => {
      req.body = {
        name: "Incomplete Product",
        description: "Description",
        price: 50,
        category: "clothing",
        // Missing image field which is required
      };

      await createProduct(req, res);

      expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Server error",
        })
      );
    });
  });

  describe("deleteProduct", () => {
    it("should delete product and its image from cloudinary", async () => {
      const product = await Product.create({
        name: "Product To Delete",
        description: "Description",
        price: 100,
        image: "https://cloudinary.com/products/image123.jpg",
        category: "electronics",
      });

      req.params.id = product._id.toString();
      cloudinary.uploader.destroy.mockResolvedValue({ result: "ok" });

      await deleteProduct(req, res);

      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
        "products/image123"
      );
      expect(res.json).toHaveBeenCalledWith({
        message: "Product deleted successfully",
      });

      // Verify product was deleted from database
      const deletedProduct = await Product.findById(product._id);
      expect(deletedProduct).toBeNull();
    });

    it("should delete product with placeholder image", async () => {
      const product = await Product.create({
        name: "Product Placeholder Image",
        description: "Description",
        price: 100,
        image: "placeholder.jpg", // Simple filename without URL structure
        category: "electronics",
      });

      req.params.id = product._id.toString();

      await deleteProduct(req, res);

      // Won't call destroy because image doesn't have the cloudinary URL structure
      expect(res.json).toHaveBeenCalledWith({
        message: "Product deleted successfully",
      });

      // Verify deletion
      const deletedProduct = await Product.findById(product._id);
      expect(deletedProduct).toBeNull();
    });

    it("should return 404 when product not found", async () => {
      req.params.id = new mongoose.Types.ObjectId().toString();

      await deleteProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Product not found",
      });
    });

    it("should handle cloudinary deletion errors gracefully", async () => {
      const product = await Product.create({
        name: "Product",
        description: "Description",
        price: 100,
        image: "https://cloudinary.com/products/image123.jpg",
        category: "electronics",
      });

      req.params.id = product._id.toString();
      cloudinary.uploader.destroy.mockRejectedValue(
        new Error("Cloudinary error")
      );

      await deleteProduct(req, res);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Error in deleting image from cloudinary",
        "Cloudinary error"
      );
      expect(res.json).toHaveBeenCalledWith({
        message: "Product deleted successfully",
      });

      // Product should still be deleted
      const deletedProduct = await Product.findById(product._id);
      expect(deletedProduct).toBeNull();
    });
  });

  describe("getRecommendedProducts", () => {
    it("should return random products from database", async () => {
      // Create multiple products
      await Product.create([
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
        {
          name: "Product 3",
          description: "Description 3",
          price: 300,
          image: "https://example.com/3.jpg",
          category: "accessories",
        },
        {
          name: "Product 4",
          description: "Description 4",
          price: 400,
          image: "https://example.com/4.jpg",
          category: "electronics",
        },
      ]);

      await getRecommendedProducts(req, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response).toHaveLength(3);
      expect(response[0]).toHaveProperty("_id");
      expect(response[0]).toHaveProperty("name");
      expect(response[0]).toHaveProperty("price");
    });

    it("should return empty array when no products exist", async () => {
      await getRecommendedProducts(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("should return fewer than 3 products if not enough exist", async () => {
      await Product.create([
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

      await getRecommendedProducts(req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.length).toBeLessThanOrEqual(2);
    });
  });

  describe("getProductsByCategory", () => {
    it("should return products filtered by category", async () => {
      // Create products in different categories
      await Product.create([
        {
          name: "Electronic 1",
          description: "Description",
          price: 100,
          image: "https://example.com/1.jpg",
          category: "electronics",
        },
        {
          name: "Electronic 2",
          description: "Description",
          price: 200,
          image: "https://example.com/2.jpg",
          category: "electronics",
        },
        {
          name: "Clothing 1",
          description: "Description",
          price: 50,
          image: "https://example.com/3.jpg",
          category: "clothing",
        },
      ]);

      req.params.category = "electronics";

      await getProductsByCategory(req, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.products).toHaveLength(2);
      expect(response.products[0].category).toBe("electronics");
      expect(response.products[1].category).toBe("electronics");
    });

    it("should return empty array for non-existent category", async () => {
      await Product.create({
        name: "Product",
        description: "Description",
        price: 100,
        image: "https://example.com/1.jpg",
        category: "electronics",
      });

      req.params.category = "nonexistent";

      await getProductsByCategory(req, res);

      expect(res.json).toHaveBeenCalledWith({ products: [] });
    });
  });

  describe("toggleFeaturedProduct", () => {
    it("should toggle product from not featured to featured", async () => {
      const product = await Product.create({
        name: "Product",
        description: "Description",
        price: 100,
        image: "https://example.com/1.jpg",
        category: "electronics",
        isFeatured: false,
      });

      req.params.id = product._id.toString();
      redis.set.mockResolvedValue("OK");

      await toggleFeaturedProduct(req, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.isFeatured).toBe(true);

      // Verify in database
      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.isFeatured).toBe(true);
      expect(redis.set).toHaveBeenCalled();
    });

    it("should toggle product from featured to not featured", async () => {
      const product = await Product.create({
        name: "Featured Product",
        description: "Description",
        price: 100,
        image: "https://example.com/1.jpg",
        category: "electronics",
        isFeatured: true,
      });

      req.params.id = product._id.toString();
      redis.set.mockResolvedValue("OK");

      await toggleFeaturedProduct(req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.isFeatured).toBe(false);

      // Verify in database
      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.isFeatured).toBe(false);
    });

    it("should return 404 when product not found", async () => {
      req.params.id = new mongoose.Types.ObjectId().toString();

      await toggleFeaturedProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Product not found",
      });
    });

    it("should update cache after toggling", async () => {
      const product = await Product.create({
        name: "Product",
        description: "Description",
        price: 100,
        image: "https://example.com/1.jpg",
        category: "electronics",
        isFeatured: false,
      });

      req.params.id = product._id.toString();
      redis.set.mockResolvedValue("OK");

      await toggleFeaturedProduct(req, res);

      expect(redis.set).toHaveBeenCalledWith(
        "featured_products",
        expect.any(String)
      );
    });
  });
});
