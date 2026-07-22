import preset from "@alphasignal/config/tailwind/preset";
import type { Config } from "tailwindcss";

const config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [preset],
} satisfies Config;

export default config;
