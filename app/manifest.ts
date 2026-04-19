import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SimpliSalon",
    short_name: "SimpliSalon",
    description: "System zarządzania salonem pieknosci",
    start_url: "/",
    display: "standalone",
    background_color: "#EDE8DF",
    theme_color: "#1C2340",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable" as unknown as "any",
      },
    ],
    shortcuts: [
      {
        name: "Grafik",
        url: "/calendar",
        description: "Otworz grafik",
      },
    ],
  };
}
