import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // GitHub Pages serves this site under /<repository>; the deploy workflow passes that path.
  basePath: process.env.PAGES_BASE_PATH,
  // Emits /tuner/index.html instead of tuner.html next to a tuner/ folder,
  // which GitHub Pages would answer with a directory redirect and a 404.
  trailingSlash: true,
  experimental: {
    agentFeedback: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
