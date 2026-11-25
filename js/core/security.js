const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;'
};

/**
 * Mengamankan teks dinamis sebelum disisipkan ke DOM / innerHTML.
 */
export function escapeHTML(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`]/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

/**
 * Penanda khusus untuk markup statis tepercaya (misalnya ikon SVG internal).
 */
export function trustedHTML(html) {
  return { __trusted: true, value: String(html) };
}

/**
 * Tagged template literal yang otomatis men-escape seluruh variabel dinamis.
 */
export function safeHTML(strings, ...values) {
  return strings.reduce((acc, str, idx) => {
    if (idx >= values.length) return acc + str;
    const val = values[idx];
    const safeVal =
      val && typeof val === 'object' && val.__trusted === true
        ? val.value
        : escapeHTML(val);
    return acc + str + safeVal;
  }, '');
}

export function setSafeHTML(element, html) {
  if (!element) return;
  element.innerHTML = html;
}
