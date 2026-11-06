const apiUrl = process.env.VITE_API_URL;
let valid = false;

try {
  const url = new URL(apiUrl);
  valid =
    url.protocol === "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    !url.username &&
    !url.password &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash &&
    !apiUrl.endsWith("/");
} catch {
  // Report the setting name without printing potentially sensitive input.
}

if (!valid) {
  console.error(
    "Set VITE_API_URL in Vercel to the hosted backend's HTTPS origin, " +
      "without a trailing slash (for example https://api.example.com). " +
      "See docs/deployment.md. Localhost cannot serve a published frontend.",
  );
  process.exit(1);
}
