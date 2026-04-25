import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cookstash",
    short_name: "Cookstash",
    description: "Recipe import and shopping workflow app",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111111",
    icons: [
      {
        src: "/window.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
