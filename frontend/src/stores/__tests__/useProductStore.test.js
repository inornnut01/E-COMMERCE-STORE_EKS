import { describe, it, expect, beforeEach, vi } from "vitest";
import { useProductStore } from "../useProductStore";
import axios from "../../lib/axios";
import { mockToastSuccess, mockToastError } from "../../test/setup";

describe("useProductStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useProductStore.setState({
      products: [],
      loading: false,
    });
    vi.clearAllMocks();
  });

  describe("setProducts", () => {
    it("should set products correctly", () => {
      const mockProducts = [
        { _id: "1", name: "Product 1", price: 100 },
        { _id: "2", name: "Product 2", price: 200 },
      ];

      useProductStore.getState().setProducts(mockProducts);

      const state = useProductStore.getState();
      expect(state.products).toEqual(mockProducts);
    });

    it("should replace existing products", () => {
      useProductStore.setState({
        products: [{ _id: "old", name: "Old Product" }],
      });

      const newProducts = [{ _id: "1", name: "New Product" }];
      useProductStore.getState().setProducts(newProducts);

      const state = useProductStore.getState();
      expect(state.products).toEqual(newProducts);
    });
  });

  describe("fetchAllProducts", () => {
    it("should fetch and set products", async () => {
      const mockProducts = [
        { _id: "1", name: "Product 1" },
        { _id: "2", name: "Product 2" },
      ];
      axios.get.mockResolvedValueOnce({ data: { products: mockProducts } });

      await useProductStore.getState().fetchAllProducts();

      const state = useProductStore.getState();
      expect(state.products).toEqual(mockProducts);
      expect(state.loading).toBe(false);
    });

    it("should handle fetch error", async () => {
      axios.get.mockRejectedValueOnce({
        response: { data: { message: "Server error" } },
      });

      await useProductStore.getState().fetchAllProducts();

      const state = useProductStore.getState();
      expect(state.loading).toBe(false);
      expect(mockToastError).toHaveBeenCalledWith("Server error");
    });

    it("should set loading during fetch", async () => {
      let loadingDuringRequest = false;
      axios.get.mockImplementationOnce(() => {
        loadingDuringRequest = useProductStore.getState().loading;
        return Promise.resolve({ data: { products: [] } });
      });

      await useProductStore.getState().fetchAllProducts();

      expect(loadingDuringRequest).toBe(true);
      expect(useProductStore.getState().loading).toBe(false);
    });
  });

  describe("fetchProductsByCategory", () => {
    it("should fetch products by category", async () => {
      const mockProducts = [
        { _id: "1", name: "T-Shirt", category: "t-shirts" },
      ];
      axios.get.mockResolvedValueOnce({ data: { products: mockProducts } });

      await useProductStore.getState().fetchProductsByCategory("t-shirts");

      expect(axios.get).toHaveBeenCalledWith("/products/category/t-shirts");
      const state = useProductStore.getState();
      expect(state.products).toEqual(mockProducts);
    });

    it("should handle category fetch error", async () => {
      axios.get.mockRejectedValueOnce({
        response: { data: { message: "Category not found" } },
      });

      await useProductStore.getState().fetchProductsByCategory("invalid");

      expect(mockToastError).toHaveBeenCalledWith("Category not found");
    });
  });

  describe("createProduct", () => {
    it("should create product and add to list", async () => {
      useProductStore.setState({
        products: [{ _id: "1", name: "Existing Product" }],
      });

      const newProduct = { _id: "2", name: "New Product", price: 100 };
      axios.post.mockResolvedValueOnce({ data: newProduct });

      await useProductStore.getState().createProduct({
        name: "New Product",
        price: 100,
      });

      const state = useProductStore.getState();
      expect(state.products).toHaveLength(2);
      expect(state.products[1]).toEqual(newProduct);
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Product created successfully"
      );
    });

    it("should handle create error", async () => {
      axios.post.mockRejectedValueOnce({
        response: { data: { message: "Invalid product data" } },
      });

      await useProductStore.getState().createProduct({ name: "" });

      expect(mockToastError).toHaveBeenCalledWith("Invalid product data");
    });
  });

  describe("deleteProduct", () => {
    it("should delete product from list", async () => {
      useProductStore.setState({
        products: [
          { _id: "1", name: "Product 1" },
          { _id: "2", name: "Product 2" },
        ],
      });
      axios.delete.mockResolvedValueOnce({});

      await useProductStore.getState().deleteProduct("1");

      const state = useProductStore.getState();
      expect(state.products).toHaveLength(1);
      expect(state.products[0]._id).toBe("2");
    });

    it("should handle delete error", async () => {
      useProductStore.setState({
        products: [{ _id: "1", name: "Product 1" }],
      });
      axios.delete.mockRejectedValueOnce({
        response: { data: { message: "Product not found" } },
      });

      await useProductStore.getState().deleteProduct("1");

      expect(mockToastError).toHaveBeenCalledWith("Product not found");
    });
  });

  describe("toggleFeaturedProduct", () => {
    it("should toggle isFeatured status", async () => {
      useProductStore.setState({
        products: [
          { _id: "1", name: "Product 1", isFeatured: false },
          { _id: "2", name: "Product 2", isFeatured: true },
        ],
      });
      axios.patch.mockResolvedValueOnce({ data: { isFeatured: true } });

      await useProductStore.getState().toggleFeaturedProduct("1");

      const state = useProductStore.getState();
      expect(state.products[0].isFeatured).toBe(true);
      expect(state.products[1].isFeatured).toBe(true); // unchanged
    });

    it("should handle toggle error", async () => {
      useProductStore.setState({
        products: [{ _id: "1", name: "Product 1", isFeatured: false }],
      });
      axios.patch.mockRejectedValueOnce({
        response: { data: { error: "Update failed" } },
      });

      await useProductStore.getState().toggleFeaturedProduct("1");

      expect(mockToastError).toHaveBeenCalledWith("Update failed");
    });
  });

  describe("fetchFeaturedProducts", () => {
    it("should fetch featured products", async () => {
      const mockFeatured = [
        { _id: "1", name: "Featured 1", isFeatured: true },
        { _id: "2", name: "Featured 2", isFeatured: true },
      ];
      axios.get.mockResolvedValueOnce({ data: mockFeatured });

      await useProductStore.getState().fetchFeaturedProducts();

      expect(axios.get).toHaveBeenCalledWith("/products/featured");
      const state = useProductStore.getState();
      expect(state.products).toEqual(mockFeatured);
    });

    it("should handle featured fetch error", async () => {
      axios.get.mockRejectedValueOnce(new Error("Server error"));

      await useProductStore.getState().fetchFeaturedProducts();

      const state = useProductStore.getState();
      expect(state.loading).toBe(false);
    });
  });
});
