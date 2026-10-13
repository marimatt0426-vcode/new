export const REVIEW_HOSTS = Object.freeze(["cdn.trustindex.io"]);

export function isHomePage(pageName) {
  if (pageName === "index" || pageName === "index.html" || pageName === "/" || pageName === "/index" || pageName === "/index.html") return true;
  try {
    const page = new URL(pageName);
    if (page.protocol === "file:") return page.pathname.endsWith("/directions/coverstory/index.html");
    return /^https?:$/.test(page.protocol) && ["/", "/index", "/index.html"].includes(page.pathname);
  } catch { return false; }
}

export function isHomeReviewRequest(pageName, requestUrl) {
  if (!isHomePage(pageName)) return false;
  try {
    const request = new URL(requestUrl);
    return /^https?:$/.test(request.protocol) && REVIEW_HOSTS.includes(request.hostname);
  } catch { return false; }
}
