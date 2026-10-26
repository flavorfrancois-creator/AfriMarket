const COUNTRY_COOKIE = "afrimarket_country";
const ADS_CONSENT_COOKIE = "afrimarket_ads_consent";
const ADS_COOKIE = "afrimarket_ads";

export function getCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const value = document.cookie.split("; ").find((entry) => entry.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : "";
}

export function setCookie(name, value, days = 180) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${days * 86400}; Path=/; SameSite=Lax${secure}`;
}

export function deleteCookie(name) {
  document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function getVisitorCountry(countries, preferredCountry = "") {
  const find = (value) => countries.find((country) => (
    country.name.toLowerCase() === String(value).toLowerCase()
    || country.iso2.toLowerCase() === String(value).toLowerCase()
  ));
  const saved = find(getCookie(COUNTRY_COOKIE));
  if (saved) return saved.name;
  const preferred = preferredCountry && find(preferredCountry);
  if (preferred) {
    setCookie(COUNTRY_COOKIE, preferred.name, 365);
    return preferred.name;
  }
  const region = (navigator.language || "").split("-").pop()?.toUpperCase();
  const detected = region && region.length === 2 ? countries.find((country) => country.iso2 === region) : null;
  if (detected) {
    setCookie(COUNTRY_COOKIE, detected.name, 365);
    return detected.name;
  }
  return "";
}

export function setVisitorCountry(country) {
  if (country) setCookie(COUNTRY_COOKIE, country, 365);
  else deleteCookie(COUNTRY_COOKIE);
}

export function getAdvertisingConsent() {
  return getCookie(ADS_CONSENT_COOKIE);
}

export function setAdvertisingConsent(consent) {
  setCookie(ADS_CONSENT_COOKIE, consent, 180);
  if (consent === "accepted") setCookie(ADS_COOKIE, "1", 180);
  else deleteCookie(ADS_COOKIE);
  window.dispatchEvent(new Event("afrimarket-ads-consent-change"));
}
