import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TSV BoxGym",
    short_name: "TSV BoxGym",
    description: "TSV BoxGym",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#154c83",
    icons: [
      {
        src: "/icons/icon-192-v2.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512-v2.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/apple-touch-icon-v2.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  }
}
