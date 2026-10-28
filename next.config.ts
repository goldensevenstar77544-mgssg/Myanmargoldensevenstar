import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Admin SDK out of the server bundle so Node loads CJS deps natively.
  // firebase-admin@14 + jose@6 (ESM-only) otherwise crashes Auth on Vercel
  // with ERR_REQUIRE_ESM from jwks-rsa's require('jose').
  serverExternalPackages: ["firebase-admin", "jose", "jwks-rsa"],
};

export default nextConfig;
