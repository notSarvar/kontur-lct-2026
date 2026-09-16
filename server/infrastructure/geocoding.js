import fs from 'node:fs/promises';

export const geocacheUrl = new URL('../../data/beeline/geocodes.json', import.meta.url);
export function normalizeAddress(address) {
  return address
    .replace(/г\.Город Москва|Город Москва|г\.\s*Москва/gi, 'Москва')
    .replace(/МО,?/g, 'Московская область,')
    .replace(/пр-кт\.?/gi, 'проспект ')
    .replace(/пр-зд\.?/gi, 'проезд ')
    .replace(/\bFTTB\b/g, '')
    .replace(/(^|[\s,])ул\.?\s+/gi, '$1улица ')
    .replace(/(^|[\s,])ул\./gi, '$1улица ')
    .replace(/пер\./gi, 'переулок ')
    .replace(/б-р\.?/gi, 'бульвар ')
    .replace(/наб\./gi, 'набережная ')
    .replace(/проезд\./gi, 'проезд ')
    .replace(/(^|\s)д\.\s*/gi, '$1')
    .replace(/,\s*д\.?\s*/gi, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function structuredAddress(address) {
  let text = normalizeAddress(address).replace(
    /(улица|проезд|переулок) (\d+-(?:я|й|ый|ой)) ([^,]+)/g,
    '$2 $3 $1',
  );
  text = text.replace(/\b(\d+)\s*к\s*(\d+)/gi, '$1к$2').replace(/\b(\d+)\s*(?:с|стр\.?)\s*(\d+)/gi, '$1с$2');
  const match = /^(?:Московская область,\s*)?(?:г\.\s*)?([^,]+?),\s*(.+),\s*([\d].*)$/.exec(text);
  if (match) return { city: match[1], street: `${match[3]} ${match[2]}`, house: match[3] };
  const outside =
    /^(?:Московская область,\s*)?(?:г\.\s*)?(Москва|Кашира|Ступино)\s+(.+?)\s+(\d[\dА-Яа-яA-Za-z/\s]*)$/.exec(
      text,
    );
  return outside
    ? { city: outside[1], street: `${outside[3]} ${outside[2]}`, house: outside[3] }
    : { q: text };
}
export async function readGeocache() {
  try {
    return JSON.parse(await fs.readFile(geocacheUrl, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}
export function resolvedPoint(address, cache) {
  const result = cache[normalizeAddress(address)];
  return result?.status === 'matched' ? { lat: result.lat, lng: result.lng, geocode: result } : null;
}
