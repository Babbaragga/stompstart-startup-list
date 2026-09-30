// Whether a new startup's submission is eligible for Stompstart, and why. The rules read the
// submission and what the web shows about it through ports; they import only the image header
// reader, so the compiled files run on their own in the public startup list's CI.
import { readImageHeader } from "../../media/src/index.js";
/** A new discovery first appeared publicly within this many months before its pull request. */
export const LAUNCH_WINDOW_MONTHS = 6;
/** Captures of the site this long before the window flag it for review. */
const CAPTURE_GRACE_DAYS = 30;
const LOGO_MIN_EDGE = 256;
const IMAGE_MAX_EDGE = 1_600;
const BRAND_IMAGE_MIN_WIDTH = 1_200;
/** Bits two 64-bit difference hashes may differ by and still be the same picture. */
const SAME_PICTURE_BITS = 10;
const COPIED_SHARE = 0.5;
const TWO_LEVEL_SUFFIXES = new Set([
    "co.uk",
    "org.uk",
    "ac.uk",
    "com.au",
    "net.au",
    "org.au",
    "co.nz",
    "co.jp",
    "com.br",
    "co.in",
    "com.sg",
    "co.za",
    "com.mx",
    "com.tr",
    "co.il",
    "com.cn",
    "com.hk",
    "co.kr",
]);
/** The domain a host belongs to, for the common public suffixes. */
export function registrableDomain(host) {
    const labels = host.toLowerCase().replace(/\.$/u, "").split(".");
    const size = TWO_LEVEL_SUFFIXES.has(labels.slice(-2).join(".")) ? 3 : 2;
    return labels.slice(-size).join(".");
}
function hostOf(url) {
    return new URL(url).hostname.toLowerCase();
}
function day(value) {
    return value.toISOString().slice(0, 10);
}
/** The window a first public appearance must fall in: six months up to the pull request. */
export function launchWindow(openedAt) {
    const to = new Date(openedAt);
    // The same day six months back, or that month's last day when it is shorter.
    const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - LAUNCH_WINDOW_MONTHS, 1));
    const monthEnd = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
    from.setUTCDate(Math.min(to.getUTCDate(), monthEnd.getUTCDate()));
    return { from: day(from), to: day(to) };
}
/** A day or month date's first and last day, or null for a coarser one. */
function dateSpan(date) {
    if (date.precision === "day" && date.value)
        return { first: date.value, last: date.value };
    if (date.precision === "month" && date.value) {
        const [year, month] = date.value.split("-").map(Number);
        if (!year || !month)
            return null;
        return { first: `${date.value}-01`, last: day(new Date(Date.UTC(year, month, 0))) };
    }
    return null;
}
const MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
];
/** Whether a page's text states this day or month in a common written form. */
export function statesDate(text, date) {
    const span = dateSpan(date);
    if (!span)
        return false;
    const [year, month, dayOfMonth] = span.first.split("-").map(Number);
    if (!year || !month)
        return false;
    const name = MONTHS[month - 1] ?? "";
    const short = name.slice(0, 3);
    const haystack = text.toLowerCase().replace(/\s+/gu, " ");
    const monthNames = `(?:${name}|${short}\\.?)`;
    const patterns = date.precision === "day"
        ? [
            `${monthNames} 0?${dayOfMonth}(?:st|nd|rd|th)?,? ${year}`,
            `0?${dayOfMonth}(?:st|nd|rd|th)? (?:of )?${monthNames},? ${year}`,
            `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`,
            `${year}/${String(month).padStart(2, "0")}/${String(dayOfMonth).padStart(2, "0")}`,
        ]
        : [`${monthNames},? ${year}`, `${year}-${String(month).padStart(2, "0")}`];
    return patterns.some((pattern) => new RegExp(pattern, "u").test(haystack));
}
const TRACKING = /^(?:utm_[a-z_]+|ref|ref_|referrer|via|aff|affiliate|aff_id|gclid|fbclid|mc_cid|mc_eid)$/u;
/** Query parameters that track or pay for a click, from any of these addresses. */
export function trackingParameters(urls) {
    const found = new Set();
    for (const url of urls) {
        for (const key of new URL(url).searchParams.keys()) {
            if (TRACKING.test(key.toLowerCase()))
                found.add(key);
        }
    }
    return [...found].sort();
}
/** A page answered with content. */
function answered(page) {
    return page.status >= 200 && page.status <= 299;
}
/**
 * A definite answer that the page is not there. Anything else that is not content (no answer,
 * a refusal, a rate limit, a server error) may be the network this check runs from, so it goes
 * to a reviewer instead of failing the submission.
 */
function gone(page) {
    return page !== null && (page.status === 404 || page.status === 410);
}
const unread = (url, page) => `${url} could not be read from here (${page?.status ?? "no response"}); a reviewer checks it`;
/** What a reader sees on a page: no scripts, styles or markup, common entities decoded. */
export function visibleText(html) {
    return html
        .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/giu, " ")
        .replace(/<!--[\s\S]*?-->/gu, " ")
        .replace(/<[^>]+>/gu, " ")
        .replace(/&nbsp;/giu, " ")
        .replace(/&amp;/giu, "&")
        .replace(/&#39;|&apos;/giu, "'")
        .replace(/&quot;/giu, '"')
        .replace(/\s+/gu, " ")
        .trim();
}
const PARKED = /(?:this domain (?:is|may be) for sale|buy this domain|domain is parked|parked free|parkingcrew|sedoparking|hugedomains|dan\.com)/iu;
const SUPERLATIVES = /\b(?:revolutionary|revolutionizing|world'?s first|best[- ]in[- ]class|cutting[- ]edge|game[- ]chang(?:er|ing)|seamless(?:ly)?|unparalleled|next[- ]generation|leverag(?:e|es|ing)|innovative|groundbreaking)\b/iu;
/** Five-word shingles of a text, for copy comparison. */
function shingles(text) {
    const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/gu, " ")
        .split(/\s+/u)
        .filter(Boolean);
    const out = new Set();
    for (let index = 0; index + 5 <= words.length; index += 1) {
        out.add(words.slice(index, index + 5).join(" "));
    }
    return out;
}
/** The share of a text's five-word runs that also appear in the other text. */
export function copiedShare(text, from) {
    const mine = shingles(text);
    if (mine.size === 0)
        return 0;
    const theirs = shingles(from);
    let shared = 0;
    for (const shingle of mine)
        if (theirs.has(shingle))
            shared += 1;
    return shared / mine.size;
}
function hammingDistance(left, right) {
    let value = left ^ right;
    let count = 0;
    while (value > 0n) {
        count += Number(value & 1n);
        value >>= 1n;
    }
    return count;
}
/** The raster icons and share image a page names, as absolute addresses. */
export function pageImages(page) {
    const found = [];
    const attribute = (tag, name) => new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "iu").exec(tag)?.[1];
    for (const tag of page.text.match(/<link\b[^>]*>/giu) ?? []) {
        const rel = attribute(tag, "rel")?.toLowerCase() ?? "";
        const href = attribute(tag, "href");
        if (href &&
            /(?:^|\s)(?:icon|apple-touch-icon|apple-touch-icon-precomposed)(?:\s|$)/u.test(rel)) {
            found.push(href);
        }
    }
    for (const tag of page.text.match(/<meta\b[^>]*>/giu) ?? []) {
        const property = (attribute(tag, "property") ?? attribute(tag, "name") ?? "").toLowerCase();
        const content = attribute(tag, "content");
        if (content && (property === "og:image" || property === "twitter:image"))
            found.push(content);
    }
    found.push("/apple-touch-icon.png", "/favicon.png");
    const absolute = new Set();
    for (const href of found) {
        try {
            const url = new URL(href, page.url);
            if (url.protocol === "https:" && !/\.(?:svg|ico)(?:$|\?)/iu.test(url.pathname)) {
                absolute.add(url.href);
            }
        }
        catch {
            // A malformed address names nothing to compare.
        }
    }
    return [...absolute];
}
/**
 * Check a submission. Every rule reports: a fail makes it ineligible; a flag passes to review
 * with the reason; a pass records what was confirmed.
 */
export async function checkEligibility(submission, ports) {
    const { input } = submission;
    const checks = [];
    const add = (id, outcome, detail) => {
        checks.push({ id, outcome, detail });
    };
    const window = launchWindow(submission.openedAt);
    const host = hostOf(input.website);
    const domain = registrableDomain(host);
    // One record per startup: already published, archived or first proposed elsewhere.
    const existing = await ports.existing({ domain, name: input.name });
    const earlier = await ports.earlierPullRequests({
        domain,
        name: input.name,
        before: submission.pullNumber,
    });
    if (existing.length > 0) {
        add("duplicate", "fail", `Already on Stompstart: ${existing.join(", ")}.`);
    }
    else if (earlier.length > 0) {
        add("duplicate", "fail", `An earlier open pull request proposes it: #${earlier.join(", #")}.`);
    }
    else {
        add("duplicate", "pass", `No record or earlier pull request for ${domain}.`);
    }
    // A real product: its site answers on its own domain and is not parked; the way in works.
    const site = await ports.page(input.website);
    if (!site || !answered(site)) {
        if (gone(site))
            add("website", "fail", `${input.website} is not there (${site?.status}).`);
        else
            add("website", "flag", `${unread(input.website, site)}.`);
    }
    else if (registrableDomain(hostOf(site.url)) !== domain) {
        add("website", "fail", `${input.website} redirects to another domain, ${hostOf(site.url)}.`);
    }
    else if (PARKED.test(visibleText(site.text))) {
        add("website", "fail", `${input.website} is a parked or for-sale page.`);
    }
    else {
        add("website", "pass", `${input.website} answers on ${domain}.`);
    }
    const deadAccess = [];
    const unreadAccess = [];
    for (const route of input.access) {
        const page = await ports.page(route.url);
        if (gone(page))
            deadAccess.push(route.url);
        else if (!page || !answered(page))
            unreadAccess.push(route.url);
    }
    if (deadAccess.length > 0) {
        add("access", "fail", `These routes are not there: ${deadAccess.join(", ")}.`);
    }
    else if (unreadAccess.length > 0) {
        add("access", "flag", `These routes could not be read from here; a reviewer checks them: ${unreadAccess.join(", ")}.`);
    }
    else {
        add("access", "pass", "Every access route answers.");
    }
    // New: the first public appearance falls in the window, and the source that dates it says so.
    const captured = await ports.earliestCapture(host);
    const registeredOn = await ports.registered(domain);
    const graceStart = new Date(`${window.from}T00:00:00Z`);
    graceStart.setUTCDate(graceStart.getUTCDate() - CAPTURE_GRACE_DAYS);
    const capturedEarly = typeof captured === "string" && captured < day(graceStart);
    const history = [
        captured === undefined
            ? "the web archive could not be read"
            : captured
                ? `first archived ${captured}`
                : "never archived",
        registeredOn ? `registered ${registeredOn}` : "registration unknown",
    ].join(", ");
    if (input.launch) {
        const span = dateSpan(input.launch.occurred_on);
        const source = await ports.page(input.launch.source.url);
        if (!span) {
            add("launch-window", "fail", "The launch needs a day or month date.");
        }
        else if (span.last < window.from || span.first > window.to) {
            add("launch-window", "fail", `The launch (${span.first.slice(0, span.first === span.last ? 10 : 7)}) is outside ${window.from} to ${window.to}.`);
        }
        else if (gone(source)) {
            add("launch-window", "fail", `The launch source ${input.launch.source.url} is not there.`);
        }
        else if (!source || !answered(source)) {
            add("launch-window", "flag", `The launch date is in the window; ${unread(input.launch.source.url, source)}; ${history}.`);
        }
        else if (!statesDate(visibleText(source.text), input.launch.occurred_on)) {
            add("launch-window", "flag", `The launch date is in the window, but its source does not state it in a common form; ${history}.`);
        }
        else if (capturedEarly) {
            add("launch-window", "flag", `The source dates the launch in the window, but the site was ${history}.`);
        }
        else {
            add("launch-window", "pass", `Launched in the window, as its source states; ${history}.`);
        }
    }
    else if (input.stage !== "prelaunch") {
        add("launch-window", "fail", "A released product states its launch, with a source.");
    }
    else if (capturedEarly) {
        add("launch-window", "flag", `A prelaunch product whose site was ${history}.`);
    }
    else {
        add("launch-window", "pass", `Prelaunch, and new to the web: ${history}.`);
    }
    // Its own logo, big enough and square enough, and traceable to its own site.
    const image = (path) => path ? submission.images.find((candidate) => candidate.path === path) : undefined;
    const logo = image(input.logo?.path);
    if (!logo) {
        add("logo", "fail", "A new discovery includes its logo beside its file.");
    }
    else {
        const header = readImageHeader(logo.bytes);
        const ratio = header.width / header.height;
        if (header.mediaType === "image/jpeg") {
            add("logo", "fail", "The logo is a PNG or WebP, not a JPEG.");
        }
        else if (Math.min(header.width, header.height) < LOGO_MIN_EDGE) {
            add("logo", "fail", `The logo is at least ${LOGO_MIN_EDGE} pixels on each side.`);
        }
        else if (Math.max(header.width, header.height) > IMAGE_MAX_EDGE) {
            add("logo", "fail", `The logo is at most ${IMAGE_MAX_EDGE} pixels on its long side.`);
        }
        else if (ratio < 0.8 || ratio > 1.25) {
            add("logo", "fail", "The logo is square or close to it.");
        }
        else {
            const mine = await ports.fingerprint(logo.bytes);
            let compared = 0;
            let match = null;
            for (const url of site && answered(site) ? pageImages(site) : []) {
                const bytes = await ports.bytes(url);
                const theirs = bytes ? await ports.fingerprint(bytes) : null;
                if (mine === null || theirs === null)
                    continue;
                compared += 1;
                if (hammingDistance(mine, theirs) <= SAME_PICTURE_BITS) {
                    match = url;
                    break;
                }
            }
            add("logo", match ? "pass" : "flag", match
                ? `The logo matches the site's own ${match}.`
                : compared > 0
                    ? "The logo does not match any icon the site serves; check it is the startup's own."
                    : "The site serves no raster icon to compare the logo with.");
        }
    }
    // At least one real image of the product, wide enough to lead its page.
    const gallery = (input.gallery ?? [])
        .map((named) => image(named.path))
        .filter((found) => found !== undefined);
    const wide = gallery.filter((found) => {
        const header = readImageHeader(found.bytes);
        return header.width >= BRAND_IMAGE_MIN_WIDTH && header.width <= IMAGE_MAX_EDGE;
    });
    add("brand-image", wide.length > 0 ? "pass" : "fail", wide.length > 0
        ? `${wide.length} product image${wide.length === 1 ? "" : "s"} at least ${BRAND_IMAGE_MIN_WIDTH} pixels wide.`
        : `A new discovery includes a product image ${BRAND_IMAGE_MIN_WIDTH} to ${IMAGE_MAX_EDGE} pixels wide.`);
    // Its own words: not copied from the site, no em dashes, no hype.
    const prose = [input.tagline, input.description, input.problem ?? ""].join("\n");
    const copied = site && answered(site) ? copiedShare(input.description, visibleText(site.text)) : 0;
    if (copied >= COPIED_SHARE) {
        add("copy", "fail", `${Math.round(copied * 100)}% of the description repeats the site; write it in your own words.`);
    }
    else if (/\u2014/u.test(prose) || /\u2014/u.test(input.launch?.summary ?? "")) {
        add("copy", "fail", "The text uses an em dash; use a comma, a colon or a new sentence.");
    }
    else if (SUPERLATIVES.test(prose)) {
        add("copy", "flag", `The text sells rather than describes: "${SUPERLATIVES.exec(prose)?.[0]}".`);
    }
    else {
        add("copy", "pass", "The text is its own and plain.");
    }
    // Clean addresses and no private contact details.
    const urls = [
        input.website,
        ...input.access.map((route) => route.url),
        ...(input.links ?? []).map((link) => link.url),
        ...(input.sources ?? []).map((source) => source.url),
        ...(input.launch ? [input.launch.source.url] : []),
    ];
    const tracking = trackingParameters(urls);
    const email = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu.test(`${prose}\n${input.launch?.summary ?? ""}`);
    add("links", tracking.length > 0 || email ? "fail" : "pass", tracking.length > 0
        ? `Remove tracking or referral parameters: ${tracking.join(", ")}.`
        : email
            ? "Remove the email address; contacts stay private."
            : "Addresses are clean and no contact details are published.");
    return Object.freeze({
        eligible: checks.every((check) => check.outcome !== "fail"),
        window,
        checks: Object.freeze(checks),
    });
}
//# sourceMappingURL=index.js.map