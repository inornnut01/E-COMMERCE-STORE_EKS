import { describe, it, expect, beforeEach, vi } from "vitest";
import { useUserStore } from "../useUserStore";
import axios from "../../lib/axios";
import { mockToastSuccess, mockToastError } from "../../test/setup";

describe("useUserStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useUserStore.setState({
      user: null,
      loading: false,
      checkingAuth: true,
    });
    vi.clearAllMocks();
  });

  describe("signup", () => {
    it("should show error when passwords do not match", async () => {
      await useUserStore.getState().signup({
        name: "Test User",
        email: "test@example.com",
        password: "password123",
        confirmPassword: "password456",
      });

      const state = useUserStore.getState();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      expect(mockToastError).toHaveBeenCalledWith("Passwords do not match");
    });

    it("should signup successfully when passwords match", async () => {
      const mockUser = {
        _id: "1",
        name: "Test User",
        email: "test@example.com",
      };
      axios.post.mockResolvedValueOnce({ data: mockUser });

      await useUserStore.getState().signup({
        name: "Test User",
        email: "test@example.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const state = useUserStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.loading).toBe(false);
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Account created successfully"
      );
    });

    it("should handle signup error", async () => {
      axios.post.mockRejectedValueOnce({
        response: { data: { message: "Email already exists" } },
      });

      await useUserStore.getState().signup({
        name: "Test User",
        email: "existing@example.com",
        password: "password123",
        confirmPassword: "password123",
      });

      const state = useUserStore.getState();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      expect(mockToastError).toHaveBeenCalledWith("Email already exists");
    });

    it("should set loading to true during signup", async () => {
      let loadingDuringRequest = false;
      axios.post.mockImplementationOnce(() => {
        loadingDuringRequest = useUserStore.getState().loading;
        return Promise.resolve({ data: { _id: "1" } });
      });

      await useUserStore.getState().signup({
        name: "Test User",
        email: "test@example.com",
        password: "password123",
        confirmPassword: "password123",
      });

      expect(loadingDuringRequest).toBe(true);
      expect(useUserStore.getState().loading).toBe(false);
    });
  });

  describe("login", () => {
    it("should login successfully", async () => {
      const mockUser = {
        _id: "1",
        name: "Test User",
        email: "test@example.com",
      };
      axios.post.mockResolvedValueOnce({ data: mockUser });

      await useUserStore.getState().login("test@example.com", "password123");

      const state = useUserStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.loading).toBe(false);
    });

    it("should handle login error", async () => {
      axios.post.mockRejectedValueOnce({
        response: { data: { message: "Invalid credentials" } },
      });

      await useUserStore.getState().login("test@example.com", "wrongpassword");

      const state = useUserStore.getState();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      expect(mockToastError).toHaveBeenCalledWith("Invalid credentials");
    });
  });

  describe("logout", () => {
    it("should logout successfully", async () => {
      useUserStore.setState({
        user: { _id: "1", name: "Test User" },
      });
      axios.post.mockResolvedValueOnce({});

      await useUserStore.getState().logout();

      const state = useUserStore.getState();
      expect(state.user).toBeNull();
    });

    it("should handle logout error", async () => {
      useUserStore.setState({
        user: { _id: "1", name: "Test User" },
      });
      axios.post.mockRejectedValueOnce({
        response: { data: { message: "Logout failed" } },
      });

      await useUserStore.getState().logout();

      expect(mockToastError).toHaveBeenCalledWith("Logout failed");
    });
  });

  describe("checkAuth", () => {
    it("should set user when authenticated", async () => {
      const mockUser = {
        _id: "1",
        name: "Test User",
        email: "test@example.com",
      };
      axios.get.mockResolvedValueOnce({ data: mockUser });

      await useUserStore.getState().checkAuth();

      const state = useUserStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.checkingAuth).toBe(false);
    });

    it("should set user to null when not authenticated", async () => {
      axios.get.mockRejectedValueOnce(new Error("Unauthorized"));

      await useUserStore.getState().checkAuth();

      const state = useUserStore.getState();
      expect(state.user).toBeNull();
      expect(state.checkingAuth).toBe(false);
    });
  });

  describe("refreshToken", () => {
    it("should refresh token successfully", async () => {
      useUserStore.setState({ checkingAuth: false });
      axios.post.mockResolvedValueOnce({ data: { accessToken: "new-token" } });

      const result = await useUserStore.getState().refreshToken();

      expect(result).toEqual({ accessToken: "new-token" });
      expect(useUserStore.getState().checkingAuth).toBe(false);
    });

    it("should not refresh if already checking auth", async () => {
      useUserStore.setState({ checkingAuth: true });

      await useUserStore.getState().refreshToken();

      expect(axios.post).not.toHaveBeenCalled();
    });

    it("should set user to null on refresh failure", async () => {
      useUserStore.setState({
        checkingAuth: false,
        user: { _id: "1", name: "Test User" },
      });
      axios.post.mockRejectedValueOnce(new Error("Token expired"));

      await expect(useUserStore.getState().refreshToken()).rejects.toThrow(
        "Token expired"
      );

      const state = useUserStore.getState();
      expect(state.user).toBeNull();
      expect(state.checkingAuth).toBe(false);
    });
  });
});
