import { describe, it, expect, beforeEach, vi } from "vitest";
import { useCartStore } from "../useCartStore";
import axios from "../../lib/axios";
import { mockToastSuccess, mockToastError } from "../../test/setup";

describe("useCartStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useCartStore.setState({
      cart: [],
      coupon: null,
      total: 0,
      subtotal: 0,
      isCouponApplied: false,
    });
    vi.clearAllMocks();
  });

  describe("calculateTotals", () => {
    it("should calculate subtotal and total correctly without coupon", () => {
      // Set up cart with items
      useCartStore.setState({
        cart: [
          { _id: "1", name: "Product 1", price: 100, quantity: 2 },
          { _id: "2", name: "Product 2", price: 50, quantity: 1 },
        ],
        coupon: null,
      });

      // Call calculateTotals
      useCartStore.getState().calculateTotals();

      // Check results
      const state = useCartStore.getState();
      expect(state.subtotal).toBe(250); // 100*2 + 50*1
      expect(state.total).toBe(250);
    });

    it("should apply coupon discount correctly", () => {
      // Set up cart with items and coupon
      useCartStore.setState({
        cart: [{ _id: "1", name: "Product 1", price: 100, quantity: 2 }],
        coupon: { code: "SAVE20", discountPercentage: 20 },
      });

      // Call calculateTotals
      useCartStore.getState().calculateTotals();

      // Check results
      const state = useCartStore.getState();
      expect(state.subtotal).toBe(200); // 100*2
      expect(state.total).toBe(160); // 200 - 20% = 160
    });

    it("should handle empty cart", () => {
      useCartStore.setState({
        cart: [],
        coupon: null,
      });

      useCartStore.getState().calculateTotals();

      const state = useCartStore.getState();
      expect(state.subtotal).toBe(0);
      expect(state.total).toBe(0);
    });

    it("should apply 50% discount coupon correctly", () => {
      useCartStore.setState({
        cart: [{ _id: "1", name: "Product 1", price: 100, quantity: 1 }],
        coupon: { code: "HALF", discountPercentage: 50 },
      });

      useCartStore.getState().calculateTotals();

      const state = useCartStore.getState();
      expect(state.subtotal).toBe(100);
      expect(state.total).toBe(50);
    });
  });

  describe("removeCoupon", () => {
    it("should reset coupon state and recalculate totals", () => {
      // Set up state with coupon applied
      useCartStore.setState({
        cart: [{ _id: "1", name: "Product 1", price: 100, quantity: 1 }],
        coupon: { code: "SAVE20", discountPercentage: 20 },
        isCouponApplied: true,
        subtotal: 100,
        total: 80,
      });

      // Remove coupon
      useCartStore.getState().removeCoupon();

      // Check results
      const state = useCartStore.getState();
      expect(state.coupon).toBeNull();
      expect(state.isCouponApplied).toBe(false);
      expect(state.total).toBe(100); // Total should equal subtotal after coupon removal
      expect(mockToastSuccess).toHaveBeenCalledWith("Coupon removed");
    });
  });

  describe("clearCart", () => {
    it("should clear all cart data", async () => {
      useCartStore.setState({
        cart: [{ _id: "1", name: "Product 1", price: 100, quantity: 1 }],
        coupon: { code: "SAVE20", discountPercentage: 20 },
        subtotal: 100,
        total: 80,
      });

      await useCartStore.getState().clearCart();

      const state = useCartStore.getState();
      expect(state.cart).toEqual([]);
      expect(state.coupon).toBeNull();
      expect(state.subtotal).toBe(0);
      expect(state.total).toBe(0);
    });
  });

  describe("getCartItems", () => {
    it("should fetch cart items and calculate totals", async () => {
      const mockCart = [
        { _id: "1", name: "Product 1", price: 50, quantity: 2 },
      ];
      axios.get.mockResolvedValueOnce({ data: mockCart });

      await useCartStore.getState().getCartItems();

      const state = useCartStore.getState();
      expect(state.cart).toEqual(mockCart);
      expect(state.subtotal).toBe(100);
      expect(state.total).toBe(100);
    });

    it("should handle error when fetching cart items", async () => {
      axios.get.mockRejectedValueOnce({
        response: { data: { message: "Failed to fetch cart" } },
      });

      await useCartStore.getState().getCartItems();

      const state = useCartStore.getState();
      expect(state.cart).toEqual([]);
      expect(mockToastError).toHaveBeenCalledWith("Failed to fetch cart");
    });
  });

  describe("applyCoupon", () => {
    it("should apply coupon successfully", async () => {
      useCartStore.setState({
        cart: [{ _id: "1", name: "Product 1", price: 100, quantity: 1 }],
        subtotal: 100,
        total: 100,
      });

      const mockCoupon = { code: "SAVE10", discountPercentage: 10 };
      axios.post.mockResolvedValueOnce({ data: mockCoupon });

      await useCartStore.getState().applyCoupon("SAVE10");

      const state = useCartStore.getState();
      expect(state.coupon).toEqual(mockCoupon);
      expect(state.isCouponApplied).toBe(true);
      expect(state.total).toBe(90); // 100 - 10%
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Coupon applied successfully"
      );
    });

    it("should handle invalid coupon", async () => {
      axios.post.mockRejectedValueOnce({
        response: { data: { message: "Invalid coupon code" } },
      });

      await useCartStore.getState().applyCoupon("INVALID");

      const state = useCartStore.getState();
      expect(state.isCouponApplied).toBe(false);
      expect(mockToastError).toHaveBeenCalledWith("Invalid coupon code");
    });
  });

  describe("addToCart", () => {
    it("should add new product to cart", async () => {
      axios.post.mockResolvedValueOnce({});
      const product = { _id: "1", name: "Product 1", price: 100 };

      await useCartStore.getState().addToCart(product);

      const state = useCartStore.getState();
      expect(state.cart).toHaveLength(1);
      expect(state.cart[0]).toEqual({ ...product, quantity: 1 });
      expect(mockToastSuccess).toHaveBeenCalledWith("Product added to cart");
    });

    it("should increment quantity for existing product", async () => {
      useCartStore.setState({
        cart: [{ _id: "1", name: "Product 1", price: 100, quantity: 1 }],
      });
      axios.post.mockResolvedValueOnce({});

      await useCartStore
        .getState()
        .addToCart({ _id: "1", name: "Product 1", price: 100 });

      const state = useCartStore.getState();
      expect(state.cart).toHaveLength(1);
      expect(state.cart[0].quantity).toBe(2);
    });
  });

  describe("removeFromCart", () => {
    it("should remove product from cart", async () => {
      useCartStore.setState({
        cart: [
          { _id: "1", name: "Product 1", price: 100, quantity: 1 },
          { _id: "2", name: "Product 2", price: 50, quantity: 1 },
        ],
        subtotal: 150,
        total: 150,
      });
      axios.delete.mockResolvedValueOnce({});

      await useCartStore.getState().removeFromCart("1");

      const state = useCartStore.getState();
      expect(state.cart).toHaveLength(1);
      expect(state.cart[0]._id).toBe("2");
      expect(state.subtotal).toBe(50);
    });
  });

  describe("updateQuantity", () => {
    it("should update product quantity", async () => {
      useCartStore.setState({
        cart: [{ _id: "1", name: "Product 1", price: 100, quantity: 1 }],
        subtotal: 100,
        total: 100,
      });
      axios.put.mockResolvedValueOnce({});

      await useCartStore.getState().updateQuantity("1", 3);

      const state = useCartStore.getState();
      expect(state.cart[0].quantity).toBe(3);
      expect(state.subtotal).toBe(300);
    });

    it("should remove product when quantity is 0", async () => {
      useCartStore.setState({
        cart: [{ _id: "1", name: "Product 1", price: 100, quantity: 1 }],
      });
      axios.delete.mockResolvedValueOnce({});

      await useCartStore.getState().updateQuantity("1", 0);

      const state = useCartStore.getState();
      expect(state.cart).toHaveLength(0);
    });
  });
});
