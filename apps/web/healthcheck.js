const url = `http://127.0.0.1:${process.env.PORT ?? "3000"}/api/health`;

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
