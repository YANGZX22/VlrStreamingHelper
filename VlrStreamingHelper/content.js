(() => {
  const extensionApi = globalThis.chrome;
  const ENABLED_CLASS = "hjc-hide-right-chat";
  const MARK = "data-hjc-right-chat";
  const DEFAULT_ENABLED = true;
  const LEGACY_STORAGE_KEY = "enabled";
  const STORAGE_KEYS = {
    hideHaojiaoComments: "hideHaojiaoComments",
    replaceVlrFlags: "replaceVlrFlags"
  };
  const HOST = location.hostname.replace(/^www\./, "");
  const RIGHT_PANEL_SELECTORS = [
    ".MgIN9 .wpkaX > ._1oGMc"
  ];
  const PANEL_TEXT_RE = /评论区|写评论|选手评分区|还没有人评论|暂无更多评论|聊天区|群聊|发消息|发送/;
  const VLR_FLAG_TEXT_RE = /^(taiwan|tw|twn)$/i;
  const CHINA_FLAG_SVG = encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600"><path fill="#de2910" d="M0 0h900v600H0z"/><path fill="#ffde00" d="m150 120 17.6 54.2h57l-46.1 33.5 17.6 54.2-46.1-33.5-46.1 33.5 17.6-54.2L75.4 174h57L150 120z"/><path fill="#ffde00" d="m286.8 75.9 7 22.8 23.8-0.5-19.6 13.5 7.8 22.5-18.9-14.5-19 14.5 7.8-22.5-19.6-13.5 23.8 0.5 7-22.8zM348 146l-4.8 23.4 21 11.2-23.7 2.6-4.2 23.5-9.8-21.7-23.6 3.3 17.6-16-10.5-21.4 20.7 11.8L348 146zm-0.8 95.6-13.6 19.6 14.4 19-22.8-6.8-13.6 19.6-0.6-23.8-22.8-6.8 22.4-7.9-0.6-23.8 14.4 19 22.4-7.9zm-60.4 72.5 6.9 22.8 23.8-0.5-19.6 13.5 7.8 22.5-18.9-14.5-18.9 14.5 7.8-22.5-19.6-13.5 23.8 0.5 6.9-22.8z"/></svg>'
  );
  const CHINA_FLAG_DATA_URL = `data:image/svg+xml;charset=utf-8,${CHINA_FLAG_SVG}`;

  let settings = {
    hideHaojiaoComments: DEFAULT_ENABLED,
    replaceVlrFlags: DEFAULT_ENABLED
  };
  let observer = null;
  let scanTimer = 0;

  const applySettings = (nextSettings) => {
    settings = {
      ...settings,
      ...nextSettings
    };
    document.documentElement.classList.toggle(ENABLED_CLASS, settings.hideHaojiaoComments);
    if (settings.hideHaojiaoComments || settings.replaceVlrFlags) {
      scheduleScan();
    }
  };

  const isHaojiaoPage = () => HOST === "haojiao.cc" || HOST.endsWith(".haojiao.cc");

  const isVlrPage = () => HOST === "vlr.gg" || HOST.endsWith(".vlr.gg");

  const markKnownPanels = () => {
    RIGHT_PANEL_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        node.setAttribute(MARK, "true");
      });
    });
  };

  const isLikelyRightPanel = (node) => {
    if (!(node instanceof HTMLElement)) return false;

    const parent = node.parentElement;
    if (!parent || !parent.classList.contains("wpkaX")) return false;
    if (node.classList.contains("yJDll")) return false;

    const rect = node.getBoundingClientRect();
    const width = rect.width || node.offsetWidth;
    const text = node.innerText || "";

    return width >= 240 && width <= 440 && PANEL_TEXT_RE.test(text);
  };

  const markHeuristicPanels = () => {
    document.querySelectorAll(".MgIN9 .wpkaX > div").forEach((node) => {
      if (isLikelyRightPanel(node)) {
        node.setAttribute(MARK, "true");
      }
    });
  };

  const replaceFlagUrl = (value) => {
    if (!value || !/(flag|country|region|nation)/i.test(value) || !/(^|[-_/])tw(?=[-_.?/)]|$)/i.test(value)) {
      return value;
    }

    return value.replace(/(^|[-_/])tw(?=[-_.?/)]|$)/gi, (match, prefix) => `${prefix || ""}cn`);
  };

  const fixVlrFlagClasses = () => {
    document.querySelectorAll(".flag.mod-tw, .mod-tw, [class*='flag'][class*='tw']").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;

      Array.from(node.classList).forEach((className) => {
        const nextClassName = className.replace(/(^|[-_])tw(?=$|[-_])/i, "$1cn");
        if (nextClassName !== className) {
          node.classList.remove(className);
          node.classList.add(nextClassName);
        }
      });

      if (node.classList.contains("mod-tw")) {
        node.classList.remove("mod-tw");
        node.classList.add("mod-cn");
      }
      if (node.classList.contains("tw")) {
        node.classList.remove("tw");
        node.classList.add("cn");
      }

      node.setAttribute("title", "China");
      node.setAttribute("aria-label", "China");
    });
  };

  const fixVlrFlagImages = () => {
    document.querySelectorAll("img, source").forEach((node) => {
      const srcAttribute = node instanceof HTMLSourceElement ? "srcset" : "src";
      const current = node.getAttribute(srcAttribute);
      const next = replaceFlagUrl(current);

      if (next && next !== current) {
        node.setAttribute(srcAttribute, next);
        if (node instanceof HTMLImageElement) {
          node.alt = "China";
          node.title = "China";
          node.onerror = () => {
            node.src = CHINA_FLAG_DATA_URL;
          };
        }
      }
    });
  };

  const fixVlrInlineStyles = () => {
    document.querySelectorAll("[style]").forEach((node) => {
      const current = node.getAttribute("style");
      const next = replaceFlagUrl(current);
      if (next && next !== current) {
        node.setAttribute("style", next);
      }
    });
  };

  const fixVlrCountryText = () => {
    document.querySelectorAll(".player-header-desc-country, [class*='country'], [class*='nation'], [class*='flag']").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;

      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && VLR_FLAG_TEXT_RE.test((child.textContent || "").trim())) {
          child.textContent = child.textContent === child.textContent?.toUpperCase() ? "CHINA" : "China";
        }
      }

      ["title", "alt", "aria-label"].forEach((attribute) => {
        const value = node.getAttribute(attribute);
        if (value && VLR_FLAG_TEXT_RE.test(value.trim())) {
          node.setAttribute(attribute, "China");
        }
      });
    });
  };

  const fixVlrTwFlags = () => {
    fixVlrFlagClasses();
    fixVlrFlagImages();
    fixVlrInlineStyles();
    fixVlrCountryText();
  };

  const scan = () => {
    scanTimer = 0;

    if (settings.hideHaojiaoComments && isHaojiaoPage()) {
      markKnownPanels();
      markHeuristicPanels();
    }

    if (settings.replaceVlrFlags && isVlrPage()) {
      fixVlrTwFlags();
    }
  };

  const scheduleScan = () => {
    if (scanTimer) return;
    scanTimer = window.setTimeout(scan, 80);
  };

  const startObserver = () => {
    if (observer) return;
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  };

  const initStorage = () => {
    if (!extensionApi?.storage?.sync) {
      applySettings(settings);
      return;
    }

    extensionApi.storage.sync.get({
      [LEGACY_STORAGE_KEY]: undefined,
      [STORAGE_KEYS.hideHaojiaoComments]: undefined,
      [STORAGE_KEYS.replaceVlrFlags]: undefined
    }, (items) => {
      const legacyEnabled = items[LEGACY_STORAGE_KEY] !== false;
      applySettings({
        hideHaojiaoComments: items[STORAGE_KEYS.hideHaojiaoComments] ?? legacyEnabled,
        replaceVlrFlags: items[STORAGE_KEYS.replaceVlrFlags] ?? legacyEnabled
      });
    });

    extensionApi.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") return;

      const nextSettings = {};
      if (changes[STORAGE_KEYS.hideHaojiaoComments]) {
        nextSettings.hideHaojiaoComments = changes[STORAGE_KEYS.hideHaojiaoComments].newValue !== false;
      }
      if (changes[STORAGE_KEYS.replaceVlrFlags]) {
        nextSettings.replaceVlrFlags = changes[STORAGE_KEYS.replaceVlrFlags].newValue !== false;
      }
      if (Object.keys(nextSettings).length > 0) {
        applySettings(nextSettings);
      }
    });
  };

  if (extensionApi?.runtime?.onMessage) {
    extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "HJC_GET_STATE") {
        sendResponse(settings);
        return true;
      }

      if (message?.type === "HJC_SET_STATE") {
        applySettings(message.settings || {});
        sendResponse(settings);
        return true;
      }

      return false;
    });
  }

  applySettings(settings);
  initStorage();
  startObserver();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan, { once: true });
  } else {
    scan();
  }
})();
