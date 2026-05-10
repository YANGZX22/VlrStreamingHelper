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
const statusText = document.getElementById("status");

const labels = {
  hideHaojiaoComments: "号角评论区",
  replaceVlrFlags: "VLR 旗帜替换"
};

const setStatus = (settings) => {
  const activeLabels = Object.entries(settings)
    .filter(([, enabled]) => enabled)
    .map(([key]) => labels[key]);

  statusText.textContent = activeLabels.length > 0
    ? `已开启：${activeLabels.join("、")}`
    : "两个功能均已暂停。";
};

const getSettingsFromControls = () => ({
  hideHaojiaoComments: controls.hideHaojiaoComments.checked,
  replaceVlrFlags: controls.replaceVlrFlags.checked
});

const updateActiveTab = (settings) => {
  chrome.tabs?.query?.({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, {
      type: "HJC_SET_STATE",
      settings
    });
  });
};

chrome.storage.sync.get({
  [LEGACY_STORAGE_KEY]: undefined,
  [STORAGE_KEYS.hideHaojiaoComments]: undefined,
  [STORAGE_KEYS.replaceVlrFlags]: undefined
}, (items) => {
  const legacyEnabled = items[LEGACY_STORAGE_KEY] !== false;
  const settings = {
    hideHaojiaoComments: items[STORAGE_KEYS.hideHaojiaoComments] ?? legacyEnabled,
    replaceVlrFlags: items[STORAGE_KEYS.replaceVlrFlags] ?? legacyEnabled
  };

  controls.hideHaojiaoComments.checked = settings.hideHaojiaoComments;
  controls.replaceVlrFlags.checked = settings.replaceVlrFlags;
  setStatus(settings);
});

Object.entries(controls).forEach(([key, input]) => {
  input.addEventListener("change", () => {
    const settings = getSettingsFromControls();
    chrome.storage.sync.set({ [STORAGE_KEYS[key]]: settings[key] }, () => {
      setStatus(settings);
      updateActiveTab(settings);
    });
  });
});
