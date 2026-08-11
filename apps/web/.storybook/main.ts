import type { StorybookConfig } from "@storybook/react-vite";
import path from "path";

const config: StorybookConfig = {
  stories: [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    const alias = config.resolve?.alias || {};
    config.resolve = {
      ...config.resolve,
      alias: {
        ...(alias as Record<string, string>),
        "@": path.resolve(__dirname, "../src"),
        "@bookmark-digest/catalog": path.resolve(
          __dirname,
          "../../packages/catalog/src",
        ),
        "@bookmark-digest/schemas": path.resolve(
          __dirname,
          "../../packages/schemas/src",
        ),
        "@bookmark-digest/shared": path.resolve(
          __dirname,
          "../../packages/shared/src",
        ),
      },
    };
    return config;
  },
};

export default config;
