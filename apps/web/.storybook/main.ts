import type { StorybookConfig } from '@storybook/nextjs-vite';

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
    name: "@storybook/nextjs-vite",
    options: {
      nextConfig: "./next.config.ts",
    },
  },
  viteFinal: async (config) => {
    // Resolve workspace packages
    const { alias } = config.resolve || {};
    config.resolve = {
      ...config.resolve,
      alias: {
        ...(alias || {}),
        "@": "<rootDir>/src",
        "@bookmark-digest/catalog": "<rootDir>/../../packages/catalog/src",
        "@bookmark-digest/schemas": "<rootDir>/../../packages/schemas/src",
        "@bookmark-digest/shared": "<rootDir>/../../packages/shared/src",
      },
    };
    return config;
  },
};

export default config;
