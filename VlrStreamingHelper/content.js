(() => {
  const extensionApi = globalThis.chrome;
  const ENABLED_CLASS = "hjc-hide-right-chat";
  const HAS_RIGHT_PANEL_CLASS = "hjc-has-right-chat";
  const ALLOW_RIGHT_PANEL_CLASS = "hjc-allow-right-chat";
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
  const HAOJIAO_MATCH_PATH_RE = /^\/wiki\/match(?:\/|$)/;
  const HAOJIAO_SCHEDULE_PATH_RE = /^\/wiki\/schedule(?:\/|$)/;
  const HAOJIAO_WIKI_SPACE_ROUTES = new Set(["wiki_home", "wiki_schedule", "schedule"]);
  const SCHEDULE_BOOTSTRAP_PARAM = "hjc_open_schedule";
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

  if (!(HOST === "haojiao.cc" || HOST.endsWith(".haojiao.cc")) || !HAOJIAO_MATCH_PATH_RE.test(location.pathname)) {
    document.documentElement.classList.add(ALLOW_RIGHT_PANEL_CLASS);
  }

  const applySettings = (nextSettings) => {
    settings = {
      ...settings,
      ...nextSettings
    };
    if (settings.hideHaojiaoComments && shouldHideHaojiaoComments()) {
      setHaojiaoFeatureState(true);
    } else {
      setHaojiaoFeatureState(false);
    }
    if (settings.hideHaojiaoComments || settings.replaceVlrFlags) {
      scheduleScan();
    }
  };

  const isHaojiaoPage = () => HOST === "haojiao.cc" || HOST.endsWith(".haojiao.cc");

  const isVlrPage = () => HOST === "vlr.gg" || HOST.endsWith(".vlr.gg");

  const isLikelyHaojiaoChatRoute = () => HAOJIAO_MATCH_PATH_RE.test(location.pathname);

  const isHaojiaoScheduleRoute = () => HAOJIAO_SCHEDULE_PATH_RE.test(location.pathname);

  const getHaojiaoWikiGameId = () => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] !== "wiki" || !HAOJIAO_WIKI_SPACE_ROUTES.has(parts[1])) return "";
    return parts[2] || "";
  };

  const getHaojiaoSchedulePath = () => {
    const gameId = getHaojiaoWikiGameId();
    return gameId ? `/wiki/schedule/${encodeURIComponent(gameId)}` : "/wiki/schedule/";
  };

  const isVisibleElement = (node) => {
    if (!(node instanceof HTMLElement)) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };

  const findScheduleNav = () => Array.from(document.querySelectorAll("span, button, a"))
    .filter((node) => node.textContent?.trim() === "赛程" && isVisibleElement(node))
    .sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectA.top - rectB.top || rectA.left - rectB.left;
    })[0] || null;

  const notifyRouteChanged = () => {
    window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
    applySettings(settings);
  };

  const pushHaojiaoScheduleRoute = () => {
    const nextPath = getHaojiaoSchedulePath();
    if (location.pathname !== nextPath) {
      history.pushState(history.state, "", nextPath);
    } else {
      history.replaceState(history.state, "", nextPath);
    }
    notifyRouteChanged();
  };

  const goToHaojiaoSchedule = (sendResponse = () => {}) => {
    if (!isHaojiaoPage()) {
      sendResponse({ ok: false, reason: "not_haojiao_page" });
      return;
    }

    if (!isHaojiaoScheduleRoute()) {
      const scheduleNav = findScheduleNav();
      if (scheduleNav) {
        scheduleNav.dispatchEvent(new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window
        }));
      }
    }

    window.setTimeout(() => {
      if (!isHaojiaoScheduleRoute()) {
        pushHaojiaoScheduleRoute();
      } else {
        notifyRouteChanged();
      }
      sendResponse({ ok: true, url: location.href });
    }, 120);
  };

  const maybeOpenScheduleFromBootstrap = () => {
    const params = new URLSearchParams(location.search);
    if (params.get(SCHEDULE_BOOTSTRAP_PARAM) !== "1") return;

    params.delete(SCHEDULE_BOOTSTRAP_PARAM);
    const nextSearch = params.toString();
    history.replaceState(history.state, "", `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`);
    window.setTimeout(() => goToHaojiaoSchedule(), 800);
  };

  const shouldHideHaojiaoComments = () => isHaojiaoPage() && isLikelyHaojiaoChatRoute();

  const setHaojiaoRightPanelState = (hasRightPanel) => {
    document.documentElement.classList.toggle(ENABLED_CLASS, hasRightPanel);
    document.documentElement.classList.toggle(HAS_RIGHT_PANEL_CLASS, hasRightPanel);
  };

  const setHaojiaoFeatureState = (enabled) => {
    document.documentElement.classList.toggle(ALLOW_RIGHT_PANEL_CLASS, !enabled);
    setHaojiaoRightPanelState(enabled);
  };

  const markKnownPanels = () => {
    let count = 0;
    RIGHT_PANEL_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (isLikelyRightPanel(node)) {
          node.setAttribute(MARK, "true");
          count += 1;
        }
      });
    });
    return count;
  };

  const isLikelyRightPanel = (node) => {
    if (!(node instanceof HTMLElement)) return false;

    const parent = node.parentElement;
    if (!parent || !parent.classList.contains("wpkaX")) return false;
    if (node.classList.contains("yJDll")) return false;

    if (isLikelyHaojiaoChatRoute()) return true;

    const text = node.innerText || node.textContent || "";
    return PANEL_TEXT_RE.test(text);
  };

  const markHeuristicPanels = () => {
    let count = 0;
    document.querySelectorAll(".MgIN9 .wpkaX > div").forEach((node) => {
      if (isLikelyRightPanel(node)) {
        node.setAttribute(MARK, "true");
        count += 1;
      }
    });
    return count;
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

    if (isHaojiaoPage()) {
      if (settings.hideHaojiaoComments && shouldHideHaojiaoComments()) {
        markKnownPanels();
        markHeuristicPanels();
        setHaojiaoFeatureState(true);
      } else {
        setHaojiaoFeatureState(false);
      }
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

  const watchRouteChanges = () => {
    const syncRouteState = () => applySettings(settings);
    const wrapHistoryMethod = (methodName) => {
      const original = history[methodName];
      history[methodName] = function wrappedHistoryMethod(...args) {
        const result = original.apply(this, args);
        syncRouteState();
        return result;
      };
    };

    wrapHistoryMethod("pushState");
    wrapHistoryMethod("replaceState");
    window.addEventListener("popstate", syncRouteState);
    window.addEventListener("hashchange", syncRouteState);
  };

  const initStorage = () => {
    if (!extensionApi?.storage?.sync) {
      applySettings(settings);
      return;
    }

    extensionApi.storage.sync.get([
      LEGACY_STORAGE_KEY,
      STORAGE_KEYS.hideHaojiaoComments,
      STORAGE_KEYS.replaceVlrFlags
    ], (items) => {
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

      if (message?.type === "HJC_GO_TO_SCHEDULE") {
        goToHaojiaoSchedule(sendResponse);
        return true;
      }

      return false;
    });
  }

  applySettings(settings);
  initStorage();
  startObserver();
  watchRouteChanges();
  maybeOpenScheduleFromBootstrap();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan, { once: true });
  } else {
    scan();
  }
})();
