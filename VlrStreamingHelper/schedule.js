(() => {
  const extensionApi = globalThis.chrome;
  const SCHEDULE_PATH_RE = /^\/wiki\/schedule(?:\/|$)/;
  const HOST = location.hostname.replace(/^www\./, "");
  const ROOT_ID = "hjc-schedule-export-root";
  const FAB_ID = "hjc-schedule-export-fab";
  const LEAGUE_ORDER = ["VCT_CHAMPIONS", "VCT_MASTERS", "EWC_WORLD", "PACIFIC", "EMEA", "AMERICAS", "CHINA", "OTHER"];
  const LEAGUE_LABELS = {
    VCT_CHAMPIONS: "VCT 冠军赛",
    VCT_MASTERS: "VCT 大师赛",
    EWC_WORLD: "EWC 世界赛",
    PACIFIC: "VCT PACIFIC",
    EMEA: "VCT EMEA",
    AMERICAS: "VCT AMER",
    CHINA: "VCT CN",
    OTHER: "OTHER"
  };

  const SELECTORS = {
    dayGroup: "._1M0NY",
    dayHeader: "._3OLk-",
    dayLabel: "._2m1xv",
    row: "._1-ZM3",
    time: "._23Pc7",
    status: "._1sMtQ",
    bo: "._2-hrM",
    teamName: "._1MtXA",
    score: "._3Wkt1",
    leagueFull: "._3Vlq1",
    stage: "._1MhQS"
  };

  const isHaojiaoSchedulePage = () =>
    (HOST === "haojiao.cc" || HOST.endsWith(".haojiao.cc")) && SCHEDULE_PATH_RE.test(location.pathname);

  const VCT_CHAMPIONS_RE = /(?:VCT|无畏契约|无畏精英)[\s\S]*(?:Champions|冠军赛|全球冠军赛)|(?:Champions|冠军赛|全球冠军赛)[\s\S]*(?:VCT|无畏契约|无畏精英)/i;
  const VCT_MASTERS_RE = /(?:VCT|无畏契约|无畏精英)[\s\S]*(?:Masters|Master|大师赛)|(?:Masters|Master|大师赛)[\s\S]*(?:VCT|无畏契约|无畏精英)/i;
  const NON_OFFICIAL_RE = /SVL|SOOP|Esports\s*Nations\s*Cup|Nations\s*Cup|国家杯/i;
  const EWC_RE = /EWC|Esports\s*World\s*Cup|电竞世界杯/i;
  const EWC_REGIONAL_RE = /预选|资格|Qualifier|Qualifiers|China|中国|(?:^|[^A-Za-z])CN(?:[^A-Za-z]|$)|APAC|Pacific|太平洋|南亚|东南亚|日本|韩国|EMEA|欧洲|中东|非洲|Americas|美洲|北美|南美|巴西/i;
  const OFFICIAL_REGION_CONTEXT_RE = /VCT|VCL|VCN|Challengers|挑战者|EWC|Esports\s*World\s*Cup|CN\s*ES|Evolution\s*Series|进化者杯|Game\s*Changers|GC['’]?/i;
  const CHINA_RE = /China|中国|中超|国服|国超|国内|VCN|VCT\s*CN|VCL\s*CN|(?:^|[^A-Za-z])CN(?:[^A-Za-z]|$)/i;
  const EMEA_RE = /EMEA|欧洲|中东|非洲/i;
  const AMERICAS_RE = /Americas|美洲|巴西|北美|南美|墨西哥|阿根廷/i;
  const PACIFIC_RE = /Pacific|太平洋|APAC|南亚|越南|东南亚|日本|韩国|港澳台/i;

  const classifyLeague = (full) => {
    if (!full) return "OTHER";
    if (VCT_CHAMPIONS_RE.test(full)) return "VCT_CHAMPIONS";
    if (VCT_MASTERS_RE.test(full)) return "VCT_MASTERS";
    if (NON_OFFICIAL_RE.test(full)) return "OTHER";
    if (EWC_RE.test(full) && !EWC_REGIONAL_RE.test(full)) return "EWC_WORLD";
    if (!OFFICIAL_REGION_CONTEXT_RE.test(full)) return "OTHER";
    if (CHINA_RE.test(full)) return "CHINA";
    if (EMEA_RE.test(full)) return "EMEA";
    if (AMERICAS_RE.test(full)) return "AMERICAS";
    if (PACIFIC_RE.test(full)) return "PACIFIC";
    return "OTHER";
  };

  const parseDateId = (rawId) => {
    if (!rawId) return null;
    const match = rawId.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (!match) return null;
    const [, y, m, d] = match;
    return { year: Number(y), month: Number(m), day: Number(d) };
  };

  const formatShortDate = (parts) => `${parts.month}.${parts.day}`;
  const formatIsoDate = (parts) => `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;

  const cleanText = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();

  const extractTeamLabel = (node) => {
    if (!node) return "";
    const title = node.getAttribute && node.getAttribute("title");
    if (title && title.trim()) return title.trim();
    return cleanText(node);
  };

  const extractMatchInfo = (row) => {
    const teamSpans = Array.from(row.querySelectorAll(SELECTORS.teamName));
    const teamA = extractTeamLabel(teamSpans[0]);
    const teamB = extractTeamLabel(teamSpans[1]);
    const stageSpans = Array.from(row.querySelectorAll(`${SELECTORS.stage} span`))
      .map((node) => cleanText(node))
      .filter(Boolean);
    const fallbackStage = stageSpans.length > 0 ? stageSpans[stageSpans.length - 1] : "";

    const hasA = teamA && teamA !== "待定" && teamA !== "TBD";
    const hasB = teamB && teamB !== "待定" && teamB !== "TBD";

    if (hasA && hasB) return `${teamA} vs ${teamB}`;
    if (hasA && !hasB) return `${teamA} vs 待定`;
    if (!hasA && hasB) return `待定 vs ${teamB}`;
    return fallbackStage || "待定";
  };

  const scrapeSchedule = () => {
    const out = [];
    document.querySelectorAll(SELECTORS.dayGroup).forEach((group) => {
      const header = group.querySelector(SELECTORS.dayHeader);
      const dateParts = parseDateId(header?.id) || parseDateId(cleanText(header?.querySelector(SELECTORS.dayLabel)));
      if (!dateParts) return;
      const iso = formatIsoDate(dateParts);
      const short = formatShortDate(dateParts);

      group.querySelectorAll(SELECTORS.row).forEach((row) => {
        const time = cleanText(row.querySelector(SELECTORS.time));
        if (!time) return;
        const leagueFull = (row.querySelector(SELECTORS.leagueFull)?.getAttribute("title")
          || cleanText(row.querySelector(SELECTORS.leagueFull))).trim();
        const league = classifyLeague(leagueFull);
        const matchInfo = extractMatchInfo(row);
        const bo = cleanText(row.querySelector(SELECTORS.bo));

        out.push({
          key: `${iso}|${time}|${leagueFull}|${matchInfo}|${out.length}`,
          dateIso: iso,
          dateShort: short,
          time,
          league,
          leagueFull,
          matchInfo,
          bo
        });
      });
    });
    return out;
  };

  const EXCEL_LEAGUE_LABELS = {
    VCT_CHAMPIONS: "CHAMPIONS",
    VCT_MASTERS: "MASTERS",
    EWC_WORLD: "EWC",
    PACIFIC: "PACIFIC",
    EMEA: "EMEA",
    AMERICAS: "AMERICAS",
    CHINA: "CN",
    OTHER: "OTHER"
  };

  const EXCEL_LEAGUE_COLORS = {
    VCT_CHAMPIONS: "#b5860d",
    VCT_MASTERS: "#7a3ff2",
    EWC_WORLD: "#d83737",
    PACIFIC: "#1bb1f2",
    EMEA: "#b5860d",
    AMERICAS: "#1f9d55",
    CHINA: "#d83737",
    OTHER: "#475467"
  };

  const excelText = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch]);

  const excelRemark = (row) => (row.bo || "").replace(/[()（）]/g, "");

  const excelCell = (row, key) => {
    if (!row) return "<td></td>";
    const color = EXCEL_LEAGUE_COLORS[row.league] || EXCEL_LEAGUE_COLORS.OTHER;
    const textStyle = `color:${color};mso-number-format:'\\@';`;
    const value = {
      dateShort: row.dateShort,
      time: row.time,
      league: EXCEL_LEAGUE_LABELS[row.league] || row.league,
      matchInfo: row.matchInfo,
      remark: excelRemark(row)
    }[key];
    return `<td style="${textStyle}">${excelText(value)}</td>`;
  };

  const toExcelHtml = (rows) => {
    const splitAt = Math.ceil(rows.length / 2);
    const leftRows = rows.slice(0, splitAt);
    const rightRows = rows.slice(splitAt);
    const rowCount = Math.max(leftRows.length, rightRows.length);
    const bodyRows = Array.from({ length: rowCount }, (_, index) => {
      const left = leftRows[index];
      const right = rightRows[index];
      return `
        <tr>
          ${excelCell(left, "dateShort")}
          ${excelCell(left, "time")}
          ${excelCell(left, "league")}
          ${excelCell(left, "matchInfo")}
          ${excelCell(left, "remark")}
          <td class="gap"></td>
          ${excelCell(right, "dateShort")}
          ${excelCell(right, "time")}
          ${excelCell(right, "league")}
          ${excelCell(right, "matchInfo")}
          ${excelCell(right, "remark")}
        </tr>`;
    }).join("");

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    col.date { width: 8%; }
    col.time { width: 11%; }
    col.league { width: 10%; }
    col.match { width: 17%; }
    col.remark { width: 4%; }
    col.gap { width: 3%; }
    th, td {
      border: 1px solid #e6e6e6;
      text-align: center;
      vertical-align: middle;
      font-family: "Microsoft YaHei", "SimSun", monospace;
      font-size: 18pt;
      white-space: nowrap;
      height: 30pt;
    }
    th {
      background: #4472c4;
      color: #ffffff;
      font-size: 20pt;
      font-weight: 700;
    }
    td.gap, th.gap {
      background: #ffffff;
      border: none;
    }
  </style>
</head>
<body>
  <table>
    <colgroup>
      <col class="date"><col class="time"><col class="league"><col class="match"><col class="remark">
      <col class="gap">
      <col class="date"><col class="time"><col class="league"><col class="match"><col class="remark">
    </colgroup>
    <thead>
      <tr>
        <th>日期</th><th>时间</th><th>赛区</th><th>对阵信息</th><th>备注</th>
        <th class="gap"></th>
        <th>日期</th><th>时间</th><th>赛区</th><th>对阵信息</th><th>备注</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
  };

  const downloadExcel = (html, filename) => {
    const blob = new Blob([`\ufeff${html}`], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  let lastScrape = [];
  let leagueFilter = new Set();
  let dateFilter = new Set();
  let selectedKeys = new Set();

  const ensureRoot = () => {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "hjc-schedule-export-root";
    root.hidden = true;
    root.innerHTML = `
      <div class="hjc-se-backdrop" data-hjc-close="1"></div>
      <div class="hjc-se-modal" role="dialog" aria-modal="true" aria-labelledby="hjc-se-title">
        <header class="hjc-se-header">
          <h2 id="hjc-se-title">导出赛程</h2>
          <button type="button" class="hjc-se-close" data-hjc-close="1" aria-label="关闭">×</button>
        </header>
        <section class="hjc-se-filters">
          <div class="hjc-se-filter-group">
            <div class="hjc-se-filter-title">赛区</div>
            <div class="hjc-se-filter-list" data-hjc-league-list></div>
          </div>
          <div class="hjc-se-filter-group hjc-se-date-filter-group">
            <div class="hjc-se-filter-title">日期</div>
            <div class="hjc-se-filter-list" data-hjc-date-list></div>
          </div>
        </section>
        <section class="hjc-se-preview">
          <table class="hjc-se-table">
            <thead>
              <tr>
                <th class="hjc-se-col-pick">
                  <input type="checkbox" data-hjc-pick-all aria-label="全选可见">
                </th>
                <th class="hjc-se-col-date">日期</th>
                <th class="hjc-se-col-time">时间</th>
                <th class="hjc-se-col-league">赛区</th>
                <th class="hjc-se-col-match">对阵信息</th>
              </tr>
            </thead>
            <tbody data-hjc-preview-body></tbody>
          </table>
          <div class="hjc-se-empty" data-hjc-empty hidden>没有符合条件的比赛</div>
        </section>
        <footer class="hjc-se-footer">
          <span class="hjc-se-count" data-hjc-count></span>
          <div class="hjc-se-actions">
            <span class="hjc-se-download-tip">识别可能有误，正在不断更新赛事匹配，敬请谅解。您可下载 .xls 文件自行修改。</span>
            <button type="button" class="hjc-se-btn hjc-se-btn-secondary" data-hjc-close="1">取消</button>
            <button type="button" class="hjc-se-btn hjc-se-btn-primary" data-hjc-download>下载 Excel</button>
          </div>
        </footer>
      </div>
    `;
    document.body.appendChild(root);

    root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.matches("[data-hjc-close]")) {
        closeModal();
      } else if (target.matches("[data-hjc-download]")) {
        handleDownload();
      }
    });

    root.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.matches("[data-hjc-league-input]")) {
        syncLeagueFilter(target.value, target.checked);
        renderFilterControls(root);
        renderPreview();
      } else if (target.matches("[data-hjc-date-input]")) {
        syncDateFilter(target.value, target.checked);
        renderFilterControls(root);
        renderPreview();
      } else if (target.matches("[data-hjc-pick-row]")) {
        toggleSetValue(selectedKeys, target.value, target.checked);
        updateSelectionMeta();
      } else if (target.matches("[data-hjc-pick-all]")) {
        const visible = filteredRows();
        if (target.checked) {
          visible.forEach((row) => selectedKeys.add(row.key));
        } else {
          visible.forEach((row) => selectedKeys.delete(row.key));
        }
        renderPreview();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !root.hidden) {
        closeModal();
      }
    });

    return root;
  };

  const toggleSetValue = (set, value, on) => {
    if (on) set.add(value);
    else set.delete(value);
  };

  const getSortedLeagues = () => {
    const leagues = Array.from(new Set(lastScrape.map((row) => row.league)));
    leagues.sort((a, b) => LEAGUE_ORDER.indexOf(a) - LEAGUE_ORDER.indexOf(b));
    return leagues;
  };

  const getSortedDates = () => Array.from(new Set(lastScrape.map((row) => row.dateIso))).sort();

  const getDatesForLeague = (league) =>
    new Set(lastScrape
      .filter((row) => row.league === league)
      .map((row) => row.dateIso));

  const getDatesForSelectedLeagues = () => {
    if (leagueFilter.size === 0) return new Set();
    return new Set(lastScrape
      .filter((row) => leagueFilter.has(row.league))
      .map((row) => row.dateIso));
  };

  const keepOnlyAvailable = (set, available) => {
    Array.from(set).forEach((value) => {
      if (!available.has(value)) set.delete(value);
    });
  };

  const pruneSelectedRows = () => {
    const visibleKeys = new Set(filteredRows().map((row) => row.key));
    keepOnlyAvailable(selectedKeys, visibleKeys);
  };

  const selectRows = (rows) => {
    rows.forEach((row) => selectedKeys.add(row.key));
  };

  const deselectRows = (rows) => {
    rows.forEach((row) => selectedKeys.delete(row.key));
  };

  const syncLeagueFilter = (league, checked) => {
    const previousDates = new Set(dateFilter);
    toggleSetValue(leagueFilter, league, checked);

    if (checked) {
      getDatesForLeague(league).forEach((date) => dateFilter.add(date));
      const addedDates = new Set(Array.from(dateFilter).filter((date) => !previousDates.has(date)));
      selectRows(lastScrape.filter((row) =>
        leagueFilter.has(row.league)
        && dateFilter.has(row.dateIso)
        && (row.league === league || addedDates.has(row.dateIso))));
    } else {
      const availableDates = getDatesForSelectedLeagues();
      keepOnlyAvailable(dateFilter, availableDates);
      deselectRows(lastScrape.filter((row) => row.league === league));
    }

    pruneSelectedRows();
  };

  const syncDateFilter = (dateIso, checked) => {
    toggleSetValue(dateFilter, dateIso, checked);
    const rows = lastScrape.filter((row) => leagueFilter.has(row.league) && row.dateIso === dateIso);

    if (checked) {
      selectRows(rows);
    } else {
      deselectRows(rows);
    }

    pruneSelectedRows();
  };

  const renderFilterControls = (root) => {
    const leagues = getSortedLeagues();
    const dates = Array.from(getDatesForSelectedLeagues()).sort();

    const leagueList = root.querySelector("[data-hjc-league-list]");
    leagueList.innerHTML = leagues.map((league) => `
        <label class="hjc-se-chip hjc-se-chip-${league.toLowerCase()}">
          <input type="checkbox" data-hjc-league-input value="${league}"${leagueFilter.has(league) ? " checked" : ""}>
          <span>${LEAGUE_LABELS[league] || league}</span>
        </label>
      `).join("");


    const dateList = root.querySelector("[data-hjc-date-list]");
    dateList.innerHTML = dates.map((iso) => {
      const parts = parseDateId(iso);
      const short = parts ? formatShortDate(parts) : iso;
      return `
        <label class="hjc-se-chip hjc-se-chip-date">
          <input type="checkbox" data-hjc-date-input value="${iso}"${dateFilter.has(iso) ? " checked" : ""}>
          <span>${short}</span>
        </label>
      `;
    }).join("");
  };

  const renderFilters = (root) => {
    const leagues = getSortedLeagues();
    const dates = getSortedDates();

    leagueFilter = new Set(leagues);
    dateFilter = new Set(dates);
    selectedKeys = new Set(lastScrape.map((row) => row.key));
    renderFilterControls(root);
  };

  const filteredRows = () =>
    lastScrape.filter((row) => leagueFilter.has(row.league) && dateFilter.has(row.dateIso));

  const renderPreview = () => {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const rows = filteredRows();
    const tbody = root.querySelector("[data-hjc-preview-body]");
    const empty = root.querySelector("[data-hjc-empty]");

    tbody.innerHTML = rows.map((row) => {
      const checked = selectedKeys.has(row.key) ? " checked" : "";
      return `
        <tr class="hjc-se-row hjc-se-row-${row.league.toLowerCase()}${checked ? " is-picked" : ""}" data-row-key="${escapeHtml(row.key)}">
          <td class="hjc-se-col-pick">
            <input type="checkbox" data-hjc-pick-row value="${escapeHtml(row.key)}"${checked} aria-label="选择此场比赛">
          </td>
          <td class="hjc-se-col-date">${escapeHtml(row.dateShort)}</td>
          <td class="hjc-se-col-time">${escapeHtml(row.time)}</td>
          <td class="hjc-se-col-league">${escapeHtml(LEAGUE_LABELS[row.league] || row.league)}</td>
          <td class="hjc-se-col-match">${escapeHtml(row.matchInfo)}</td>
        </tr>
      `;
    }).join("");

    empty.hidden = rows.length > 0;
    updateSelectionMeta();
  };

  const updateSelectionMeta = () => {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const visible = filteredRows();
    const visibleSelected = visible.filter((row) => selectedKeys.has(row.key)).length;
    const count = root.querySelector("[data-hjc-count]");
    const pickAll = root.querySelector("[data-hjc-pick-all]");
    const downloadBtn = root.querySelector("[data-hjc-download]");

    count.textContent = `已选 ${selectedKeys.size} 场 / 显示 ${visible.length} 场 / 全部 ${lastScrape.length} 场`;

    if (pickAll instanceof HTMLInputElement) {
      if (visible.length === 0) {
        pickAll.checked = false;
        pickAll.indeterminate = false;
        pickAll.disabled = true;
      } else {
        pickAll.disabled = false;
        pickAll.checked = visibleSelected === visible.length;
        pickAll.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
      }
    }

    if (downloadBtn instanceof HTMLButtonElement) {
      downloadBtn.disabled = selectedKeys.size === 0;
    }

    root.querySelectorAll("tr[data-row-key]").forEach((tr) => {
      const key = tr.getAttribute("data-row-key");
      tr.classList.toggle("is-picked", selectedKeys.has(key));
    });
  };

  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch]);

  const openModal = () => {
    if (!isHaojiaoSchedulePage()) {
      alert("请先打开号角赛程页面 (web.haojiao.cc/wiki/schedule/...) 再使用导出功能。");
      return;
    }
    lastScrape = scrapeSchedule();
    const root = ensureRoot();
    if (lastScrape.length === 0) {
      alert("没有读取到赛程数据，请等待页面加载完成后再试。");
      return;
    }
    renderFilters(root);
    renderPreview();
    root.hidden = false;
    document.documentElement.classList.add("hjc-se-modal-open");
  };

  const closeModal = () => {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.hidden = true;
    document.documentElement.classList.remove("hjc-se-modal-open");
  };

  const handleDownload = () => {
    const rows = lastScrape.filter((row) => selectedKeys.has(row.key));
    if (rows.length === 0) {
      alert("请至少勾选一场比赛再导出。");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadExcel(toExcelHtml(rows), `haojiao-schedule-${stamp}.xls`);
  };

  const ensureFab = () => {
    if (document.getElementById(FAB_ID)) return;
    const button = document.createElement("button");
    button.id = FAB_ID;
    button.type = "button";
    button.className = "hjc-schedule-fab";
    button.title = "导出赛程为 Excel";
    button.textContent = "导出赛程";
    button.addEventListener("click", openModal);
    document.body.appendChild(button);
  };

  const removeFab = () => {
    const fab = document.getElementById(FAB_ID);
    if (fab) fab.remove();
    closeModal();
  };

  const syncFabVisibility = () => {
    if (!document.body) return;
    if (isHaojiaoSchedulePage()) {
      ensureFab();
    } else {
      removeFab();
    }
  };

  const watchRouteChanges = () => {
    const wrap = (methodName) => {
      const original = history[methodName];
      history[methodName] = function wrapped(...args) {
        const result = original.apply(this, args);
        queueMicrotask(syncFabVisibility);
        return result;
      };
    };
    wrap("pushState");
    wrap("replaceState");
    window.addEventListener("popstate", syncFabVisibility);
    window.addEventListener("hashchange", syncFabVisibility);
  };

  if (extensionApi?.runtime?.onMessage) {
    extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "HJC_OPEN_SCHEDULE_EXPORT") {
        if (isHaojiaoSchedulePage()) {
          openModal();
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, reason: "not_schedule_page" });
        }
        return true;
      }
      return false;
    });
  }

  const init = () => {
    syncFabVisibility();
    watchRouteChanges();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
