export const escapeHtml = (value = '') => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char])

export function cardPage(card, photoPath, vcardPath) {
  const e = escapeHtml
  const initials = card.fullName.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('')
  const photo = card.photo
    ? `<img class="avatar" src="${photoPath}" alt="">`
    : `<span class="avatar" aria-hidden="true">${e(initials)}</span>`
  const links = [
    ['Email', card.email && `mailto:${encodeURIComponent(card.email).replace('%40', '@')}`, card.email],
    ['Call', card.phone && `tel:${card.phone.replace(/[^0-9+]/g, '')}`, card.phone],
    ['Website', card.website], ['LinkedIn', card.linkedin], ['Instagram', card.instagram],
  ].filter(([, href]) => href)
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${e(card.fullName)} · Tapfolio</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#edf4f0;color:#112c26;font:1rem/1.55 system-ui,sans-serif;padding:2rem 1rem}
main{max-width:31rem;margin:clamp(0rem,7vh,4rem) auto;background:white;border:1px solid #d8e5dd;border-radius:1.5rem;overflow:hidden}
header{background:#102c26;color:#f5fff9;padding:2rem}header p{margin:.4rem 0 0;color:#c5ded2}
.brand{color:#9cf0bd;font-size:.875rem;font-weight:750;letter-spacing:.09em;margin-bottom:2rem}
.avatar{width:5rem;height:5rem;border-radius:1.3rem;object-fit:cover;background:#c6f3d4;color:#13352a;display:grid;place-items:center;font-weight:800;font-size:1.55rem}
h1{font-size:clamp(2rem,8vw,2.75rem);line-height:1.05;margin:1rem 0 .6rem;overflow-wrap:anywhere}
.body{padding:1.5rem 2rem 2rem}.about{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 1.5rem}
.links{display:grid;gap:.65rem}a{display:block;padding:.72rem 1rem;border:1px solid #d8e5dd;border-radius:.8rem;color:#13352a;font-weight:700;text-decoration:none;overflow-wrap:anywhere}a span{display:block;font-size:.9rem;font-weight:400}a:hover,a:focus-visible{background:#edf4f0}.save{background:#c6f3d4;border-color:#c6f3d4}
</style></head><body><main><header><div class="brand">TAPFOLIO</div>${photo}
<h1>${e(card.fullName)}</h1>${[card.jobTitle, card.company].some(Boolean) ? `<p>${e([card.jobTitle, card.company].filter(Boolean).join(' · '))}</p>` : ''}
${card.category ? `<p>${e(card.category)}</p>` : ''}</header>
<div class="body">${card.about ? `<p class="about">${e(card.about)}</p>` : ''}
<div class="links"><a class="save" href="${vcardPath}" download>Save contact</a>
${links.map(([label, href, value]) => `<a href="${e(href)}">${label}${value ? `<span>${e(value)}</span>` : ''}</a>`).join('')}</div></div></main></body></html>`
}

export function vcard(card) {
  const esc = value => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[,;]/g, '\\$&')
  const splitName = card.fullName.split(/\s+/)
  const family = splitName.length > 1 ? splitName.pop() : ''
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(family)};${esc(splitName.join(' '))};;;`, `FN:${esc(card.fullName)}`]
  const fields = {
    ORG: card.company, TITLE: card.jobTitle, 'EMAIL;TYPE=INTERNET': card.email,
    TEL: card.phone, URL: card.website, NOTE: card.about,
  }
  for (const [name, value] of Object.entries(fields)) {
    if (value) lines.push(`${name}:${esc(value)}`)
  }
  return [...lines, 'END:VCARD', ''].join('\r\n')
}
