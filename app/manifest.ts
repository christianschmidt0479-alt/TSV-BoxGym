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
        src: "/tsv-boxgym-stack-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/tsv-boxgym-stack-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/tsv-boxgym-stack-apple.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/favicon-tsv-boxgym-stack.ico",
        sizes: "256x256",
        type: "image/x-icon",
      },
    ],
  }
}
