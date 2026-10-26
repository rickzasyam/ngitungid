/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Supaya tombol AI di browser ikut sakelar yang sama dengan route-nya (lib/ai-features.ts).
  env: {
    AI_FEATURES_ENABLED: process.env.AI_FEATURES_ENABLED ?? '',
  },
}

export default nextConfig
