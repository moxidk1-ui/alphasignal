const port = process.env.PORT ?? "4000";
const url = `http://127.0.0.1:${port}/health/live`;

try {
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(3000),
  });

  if (!response.ok) {
    process.exit(1);
  }
} catch {
  process.exit(1);
}
