const LEGACY_STORAGE_KEY = "enabled";
const DEFAULT_ENABLED = true;
const STORAGE_KEYS = {
  hideHaojiaoComments: "hideHaojiaoComments",
  replaceVlrFlags: "replaceVlrFlags"
};

const controls = {
  hideHaojiaoComments: document.getElementById("hideHaojiaoComments"),
  replaceVlrFlags: document.getElementById("replaceVlrFlags")
};

const getSettingsFromControls = () => ({
  hideHaojiaoComments: controls.hideHaojiaoComments.checked,
  replaceVlrFlags: controls.replaceVlrFlags.checked
});

const sendTabMessage = (tabId, message, callback = () => {}) => {
  chrome.tabs.sendMessage(tabId, message, (response) => {
    const error = chrome.runtime.lastError;
    callback(error, response);
  });
};

const updateActiveTab = (settings) => {
  chrome.tabs?.query?.({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return;
    sendTabMessage(tab.id, {
      type: "HJC_SET_STATE",
      settings
    });
  });
};

chrome.storage.sync.get([
  LEGACY_STORAGE_KEY,
  STORAGE_KEYS.hideHaojiaoComments,
  STORAGE_KEYS.replaceVlrFlags
], (items) => {
  const legacyEnabled = items[LEGACY_STORAGE_KEY] !== false;
  const settings = {
    hideHaojiaoComments: items[STORAGE_KEYS.hideHaojiaoComments] ?? legacyEnabled,
    replaceVlrFlags: items[STORAGE_KEYS.replaceVlrFlags] ?? legacyEnabled
  };

  controls.hideHaojiaoComments.checked = settings.hideHaojiaoComments;
  controls.replaceVlrFlags.checked = settings.replaceVlrFlags;
});

Object.entries(controls).forEach(([key, input]) => {
  input.addEventListener("change", () => {
    const settings = getSettingsFromControls();
    chrome.storage.sync.set({ [STORAGE_KEYS[key]]: settings[key] }, () => {
      updateActiveTab(settings);
    });
  });
});

const DEFAULT_HAOJIAO_WIKI_GAME_ID = "t2Ud5pOQlscKLbRC";
const SCHEDULE_BOOTSTRAP_PARAM = "hjc_open_schedule";
const SCHEDULE_URL_RE = /^https?:\/\/([^/]+\.)?haojiao\.cc\/wiki\/schedule(?:\/|$)/;
const HAOJIAO_WIKI_URL_RE = /^https?:\/\/([^/]+\.)?haojiao\.cc\/wiki\/(?:wiki_home|wiki_schedule|schedule)(?:\/|$)/;
const HAOJIAO_WIKI_SPACE_ROUTES = new Set(["wiki_home", "wiki_schedule", "schedule"]);
const exportButton = document.getElementById("openScheduleExport");

const getHaojiaoWikiGameId = (tabUrl) => {
  try {
    const url = new URL(tabUrl);
    const host = url.hostname.replace(/^www\./, "");
    const parts = url.pathname.split("/").filter(Boolean);

    if (
      (host === "haojiao.cc" || host.endsWith(".haojiao.cc"))
      && parts[0] === "wiki"
      && HAOJIAO_WIKI_SPACE_ROUTES.has(parts[1])
      && parts[2]
    ) {
      return parts[2];
    }
  } catch {
    // Fall through to the default wiki.
  }

  return DEFAULT_HAOJIAO_WIKI_GAME_ID;
};

const getScheduleBootstrapUrl = (tabUrl) => {
  const gameId = getHaojiaoWikiGameId(tabUrl);
  const url = new URL(`https://web.haojiao.cc/wiki/wiki_home/${encodeURIComponent(gameId)}`);
  url.searchParams.set(SCHEDULE_BOOTSTRAP_PARAM, "1");
  return url.href;
};

const updateExportButton = (tab) => {
  const onSchedulePage = Boolean(tab?.url && SCHEDULE_URL_RE.test(tab.url));
  exportButton.textContent = onSchedulePage ? "选择赛程并导出" : "前往赛程页";
  exportButton.dataset.onSchedule = onSchedulePage ? "1" : "0";
};

const openSchedulePage = (tab) => {
  if (tab?.id && tab.url && HAOJIAO_WIKI_URL_RE.test(tab.url)) {
    sendTabMessage(tab.id, { type: "HJC_GO_TO_SCHEDULE" }, (error, response) => {
      if (error || !response?.ok) {
        chrome.tabs?.create?.({ url: getScheduleBootstrapUrl(tab.url) });
      }
      window.close();
    });
    return;
  }

  chrome.tabs?.create?.({ url: getScheduleBootstrapUrl(tab?.url) });
  window.close();
};

chrome.tabs?.query?.({ active: true, currentWindow: true }, ([tab]) => {
  updateExportButton(tab);
});

exportButton.addEventListener("click", () => {
  if (exportButton.dataset.onSchedule === "1") {
    chrome.tabs?.query?.({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return;
      sendTabMessage(tab.id, { type: "HJC_OPEN_SCHEDULE_EXPORT" }, () => {
        window.close();
      });
    });
  } else {
    chrome.tabs?.query?.({ active: true, currentWindow: true }, ([tab]) => {
      openSchedulePage(tab);
    });
  }
});
