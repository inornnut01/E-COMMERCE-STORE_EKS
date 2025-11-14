export default {
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["<rootDir>/backend/test/**/*.test.js"],
  collectCoverageFrom: ["<rootDir>/backend/**/*.js"],
  coveragePathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/backend/test/",
  ],
  transform: {},
  testTimeout: 30000,
};
