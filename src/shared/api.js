export const isOnboarding = /^\/onboarding\/?$/.test(window.location.pathname);
const session = isOnboarding
  ? Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('')
  : null;
export function apiUrl(path) {
  return isOnboarding ? `/api/onboarding/${session}${path.slice(4)}` : path;
}
export const apiFetch = (path, options) => fetch(apiUrl(path), options);
