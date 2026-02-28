/**
 * figma-html-import — URL Fetcher
 *
 * Opens a URL in a headless browser (Puppeteer), waits for rendering,
 * then extracts HTML with all computed styles inlined.
 * This allows converting any live webpage into Figma nodes.
 */

import puppeteer from "puppeteer";

export interface FetchOptions {
  /** CSS selector to extract a specific element (default: "body") */
  selector?: string;
  /** Viewport width in px (default: 1440) */
  viewportWidth?: number;
  /** Viewport height in px (default: 900) */
  viewportHeight?: number;
  /** Max wait time in ms for page load (default: 30000) */
  timeout?: number;
  /** Wait for this selector to appear before extracting (optional) */
  waitForSelector?: string;
}

/**
 * Fetch a URL, render it in a headless browser, and return HTML
 * with all computed styles inlined on each element.
 */
export async function fetchUrlAsHtml(
  url: string,
  options: FetchOptions = {}
): Promise<string> {
  const {
    selector = "body",
    viewportWidth = 1440,
    viewportHeight = 900,
    timeout = 30000,
    waitForSelector,
  } = options;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: viewportWidth, height: viewportHeight });

    console.error(`Fetching ${url}...`);
    await page.goto(url, { waitUntil: "networkidle2", timeout });

    if (waitForSelector) {
      console.error(`Waiting for ${waitForSelector}...`);
      await page.waitForSelector(waitForSelector, { timeout: 10000 });
    }

    // Small delay to let any CSS transitions / lazy styles settle
    await new Promise((r) => setTimeout(r, 500));

    console.error(`Extracting HTML with computed styles...`);

    // Run in browser context: clone the target element tree and inline all computed styles
    const html = await page.evaluate((sel: string) => {
      const root = document.querySelector(sel);
      if (!root) throw new Error(`Selector "${sel}" not found on page`);

      const clone = root.cloneNode(true) as HTMLElement;

      // CSS properties we care about for Figma conversion
      const PROPS = [
        "display", "flex-direction", "flex-wrap", "gap", "row-gap", "column-gap",
        "align-items", "justify-content", "align-self",
        "flex-grow", "flex-shrink",
        "width", "min-width", "max-width", "height", "min-height", "max-height",
        "padding-top", "padding-right", "padding-bottom", "padding-left",
        "margin-top", "margin-right", "margin-bottom", "margin-left",
        "background-color", "background-image",
        "color", "opacity",
        "font-family", "font-size", "font-weight", "font-style",
        "line-height", "letter-spacing", "text-align", "text-decoration",
        "text-transform",
        "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
        "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
        "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
        "border-top-left-radius", "border-top-right-radius",
        "border-bottom-left-radius", "border-bottom-right-radius",
        "box-shadow",
        "overflow", "position",
        "top", "left", "right", "bottom",
        "visibility",
      ];

      function inlineStyles(src: Element, dst: HTMLElement) {
        // Handle SVG elements — flatten to a sized placeholder div
        if (src instanceof SVGElement) {
          if (src.tagName.toLowerCase() === 'svg') {
            const rect = src.getBoundingClientRect();
            const w = Math.round(rect.width) || 24;
            const h = Math.round(rect.height) || 24;
            dst.setAttribute('data-element-type', 'svg');
            dst.setAttribute('data-width', String(w));
            dst.setAttribute('data-height', String(h));
            // Remove SVG internal elements from clone
            while (dst.firstChild) dst.removeChild(dst.firstChild);
          }
          return;
        }

        if (!(src instanceof HTMLElement)) return;

        const computed = getComputedStyle(src);

        // Skip invisible elements
        if (computed.display === "none") {
          dst.setAttribute("style", "display:none");
          return;
        }

        const displayVal = computed.display;
        const isFlexContainer = displayVal === "flex" || displayVal === "inline-flex";

        const styles: string[] = [];
        for (const prop of PROPS) {
          const val = computed.getPropertyValue(prop);
          if (val && val !== "" && val !== "normal" && val !== "none" && val !== "auto") {
            // Skip most 0px values, but keep border-*-width:0px (overrides css-defaults)
            if (val === "0px" && !(prop.startsWith("border-") && prop.endsWith("-width"))) continue;
            // Skip transparent backgrounds
            if (prop === "background-color" && (val === "rgba(0, 0, 0, 0)" || val === "transparent")) continue;
            // Skip flex-related properties when element is NOT a flex container
            // (browsers report flex-direction:row as default for ALL elements)
            if (!isFlexContainer && (prop === "flex-direction" || prop === "flex-wrap" || prop === "justify-content" || prop === "align-items" || prop === "column-gap" || prop === "row-gap" || prop === "gap")) continue;
            // Skip default values — keep display:block so mapper knows it's not flex
            if (prop === "display" && val === "inline") continue;
            if (prop === "position" && val === "static") continue;
            // Skip position offsets for non-positioned elements
            if ((prop === "top" || prop === "left" || prop === "right" || prop === "bottom") && val === "auto") continue;
            if (prop === "visibility" && val === "visible") continue;
            if (prop === "opacity" && val === "1") continue;
            if (prop === "font-style" && val === "normal") continue;
            if (prop === "text-decoration" && val.startsWith("none")) continue;
            if (prop === "text-transform" && val === "none") continue;
            if (prop === "overflow" && val === "visible") continue;
            if (prop === "flex-wrap" && val === "nowrap") continue;
            // Skip default flex values
            if (prop === "flex-grow" && val === "0") continue;
            if (prop === "flex-shrink" && val === "1") continue;
            // border-*-width:0px is kept (handled above) to override css-defaults
            if (prop.startsWith("border-") && prop.endsWith("-style") && val === "none") continue;
            if (prop.startsWith("border-") && prop.endsWith("-radius") && val === "0px") continue;
            // Skip zero margins
            if (prop.startsWith("margin-") && val === "0px") continue;
            // Skip zero padding
            if (prop.startsWith("padding-") && val === "0px") continue;
            // Skip 0 gap
            if ((prop === "gap" || prop === "row-gap" || prop === "column-gap") && val === "0px") continue;
            // Skip default box-shadow
            if (prop === "box-shadow" && val === "none") continue;

            styles.push(`${prop}:${val}`);
          }
        }

        if (styles.length > 0) {
          dst.setAttribute("style", styles.join(";"));
        }

        // Preserve src/alt on images + capture absolute URL and rendered dimensions
        if (src.tagName === "IMG") {
          const img = src as HTMLImageElement;
          // Capture absolute URL
          const imgSrc = img.currentSrc || img.src;
          if (imgSrc) dst.setAttribute('data-src', imgSrc);
          // Use rendered dimensions (more accurate than natural size)
          const imgRect = src.getBoundingClientRect();
          if (imgRect.width > 0) {
            dst.setAttribute('data-width', String(Math.round(imgRect.width)));
            dst.setAttribute('data-height', String(Math.round(imgRect.height)));
          } else if (img.naturalWidth > 0) {
            dst.setAttribute("data-width", String(img.naturalWidth));
            dst.setAttribute("data-height", String(img.naturalHeight));
          }
        }

        // Recurse into children
        const srcChildren = src.children;
        const dstChildren = dst.children;
        for (let i = 0; i < srcChildren.length && i < dstChildren.length; i++) {
          inlineStyles(srcChildren[i], dstChildren[i] as HTMLElement);
        }

        // Capture ::before pseudo-element
        try {
          const beforeStyle = getComputedStyle(src, '::before');
          const beforeContent = beforeStyle.getPropertyValue('content');
          if (beforeContent && beforeContent !== 'none' && beforeContent !== 'normal' && beforeContent !== '""' && beforeContent !== "''") {
            const text = beforeContent.replace(/^["']|["']$/g, '');
            if (text && text.trim()) {
              const pseudoEl = document.createElement('span');
              pseudoEl.setAttribute('data-pseudo', 'before');
              pseudoEl.textContent = text;
              const pStyles: string[] = [];
              const pComputed = beforeStyle;
              for (const prop of ['color', 'background-color', 'font-family', 'font-size', 'font-weight',
                'font-style', 'line-height', 'letter-spacing', 'text-transform', 'text-decoration',
                'display', 'width', 'height', 'opacity',
                'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
                'margin-top', 'margin-right', 'margin-bottom', 'margin-left'] as const) {
                const v = pComputed.getPropertyValue(prop);
                if (!v || v === '' || v === 'normal' || v === 'none' || v === 'auto' || v === '0px') continue;
                if (prop === 'display' && v === 'inline') continue;
                if (prop === 'opacity' && v === '1') continue;
                if (prop === 'background-color' && (v === 'rgba(0, 0, 0, 0)' || v === 'transparent')) continue;
                pStyles.push(`${prop}:${v}`);
              }
              if (pStyles.length > 0) pseudoEl.setAttribute('style', pStyles.join(';'));
              dst.insertBefore(pseudoEl, dst.firstChild);
            }
          }
        } catch (_) { /* ignore pseudo-element errors */ }

        // Capture ::after pseudo-element
        try {
          const afterStyle = getComputedStyle(src, '::after');
          const afterContent = afterStyle.getPropertyValue('content');
          if (afterContent && afterContent !== 'none' && afterContent !== 'normal' && afterContent !== '""' && afterContent !== "''") {
            const text = afterContent.replace(/^["']|["']$/g, '');
            if (text && text.trim()) {
              const pseudoEl = document.createElement('span');
              pseudoEl.setAttribute('data-pseudo', 'after');
              pseudoEl.textContent = text;
              const pStyles: string[] = [];
              const pComputed = afterStyle;
              for (const prop of ['color', 'background-color', 'font-family', 'font-size', 'font-weight',
                'font-style', 'line-height', 'letter-spacing', 'text-transform', 'text-decoration',
                'display', 'width', 'height', 'opacity',
                'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
                'margin-top', 'margin-right', 'margin-bottom', 'margin-left'] as const) {
                const v = pComputed.getPropertyValue(prop);
                if (!v || v === '' || v === 'normal' || v === 'none' || v === 'auto' || v === '0px') continue;
                if (prop === 'display' && v === 'inline') continue;
                if (prop === 'opacity' && v === '1') continue;
                if (prop === 'background-color' && (v === 'rgba(0, 0, 0, 0)' || v === 'transparent')) continue;
                pStyles.push(`${prop}:${v}`);
              }
              if (pStyles.length > 0) pseudoEl.setAttribute('style', pStyles.join(';'));
              dst.appendChild(pseudoEl);
            }
          }
        } catch (_) { /* ignore pseudo-element errors */ }
      }

      inlineStyles(root, clone);

      // Remove script tags and hidden elements
      clone.querySelectorAll("script, noscript, link, meta, style").forEach((el) => el.remove());

      return clone.outerHTML;
    }, selector);

    return html;
  } finally {
    await browser.close();
  }
}
