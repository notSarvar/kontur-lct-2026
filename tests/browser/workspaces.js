export function hackathonUrl(base = process.env.TEST_URL || 'http://127.0.0.1:4317') {
  if (process.env.TEST_HACKATHON_URL) return process.env.TEST_HACKATHON_URL;
  const url = new URL(base);
  url.hostname = 'hackathon.localhost';
  return url.origin;
}

export async function openHackathon(page) {
  await page.goto(hackathonUrl());
}
