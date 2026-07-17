const publicHttpsUrl = import.meta.env.VITE_PUBLIC_HTTPS_URL as string | undefined;

export function secureVersionUrl(pathname = window.location.pathname) {
  if (!publicHttpsUrl) return null;
  try {
    const target = new URL(publicHttpsUrl);
    target.pathname = pathname;
    target.search = window.location.search;
    return target.toString();
  } catch {
    return null;
  }
}
