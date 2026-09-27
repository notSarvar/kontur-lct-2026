// One server and one day; only the interface depends on the requested host.
// This is interface routing, not authentication or data isolation.
export function workspaceConfig(env = process.env) {
  const port = env.PORT || 4317;
  const origin = (value, name) => {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error(`${name}: укажите origin без пути, параметров и пароля`);
    }
    return url;
  };
  const product = origin(env.PRODUCT_ORIGIN || `http://localhost:${port}`, 'PRODUCT_ORIGIN');
  const hackathon = origin(env.HACKATHON_ORIGIN || `http://hackathon.localhost:${port}`, 'HACKATHON_ORIGIN');
  if (product.host === hackathon.host) throw new Error('Адреса продукта и хакатона должны различаться');
  return { product, hackathon };
}

export function workspaceFor(host, config) {
  let requested;
  try {
    requested = new URL(`${config.hackathon.protocol}//${host}`).host;
  } catch {
    requested = '';
  }
  return {
    mode: requested === config.hackathon.host ? 'hackathon' : 'product',
    productUrl: config.product.origin,
    hackathonUrl: config.hackathon.origin,
  };
}
