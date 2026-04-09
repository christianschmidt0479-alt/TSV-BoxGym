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
        src: "/boxgym-icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/boxgym-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/boxgym-apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/boxgym-favicon.ico",
        sizes: "256x256",
        type: "image/x-icon",
      },
    ],
  }
}
