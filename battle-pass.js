/* Production battle pass: display server state; never award in the browser. */
(function () {
  "use strict";
  const root = document.getElementById("tab-battlepass");
  if (!root || window.BP_LOCAL_PREVIEW === true) return;
  const $ = id => document.getElementById(id);
  const route = $("bp-route");
  const format = new Intl.NumberFormat("ru-RU");
  const days = new Intl.PluralRules("ru-RU");
  const number = value => format.format(value);
  const signed = () => typeof tg !== "undefined" && Boolean(tg?.initData);
  const hasCount = count => Number.isSafeInteger(count) && count >= 0;
  const seasonActive = () => state?.status === "active";
  const isReady = item => Boolean(seasonActive() && item?.ready && !item.claimed);
  const retrySpin = () => typeof passRequestId === "string" && passRequestId !== "";
  const caseCount = () => hasCount(state?.remaining) ? state.remaining : 0;
  const ICONS = {
    tickets: "M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4ZM15 8v8",
    case: "m3 7 9-4 9 4v10l-9 4-9-4Zm0 0 9 4 9-4M12 11v10M7.5 5l9 4v5",
    badge: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
    level: "M12 2v5m0 10v5M2 12h5m10 0h5M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
    quiz: "M6 3h12v18H6zM9 9a3 3 0 1 1 4 2.8c-.65.25-1 1-1 1.7m0 2.5v1",
    chest: "M3 9h18v11H3zM3 9V7l2-3h14l2 3v2M10 9v5h4V9",
  };
  let state = null, selected = null, filter = "all", busy = "", refreshQueued = false;
  let levelNodes = [];

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function icon(kind) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    for (const [key, value] of Object.entries({viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.5", class: "bp-art-icon", "aria-hidden": "true", focusable: "false"})) svg.setAttribute(key, value);
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", ICONS[kind]);
    svg.append(path);
    return svg;
  }
  function art(container, item) {
    container.replaceChildren(icon(item.kind));
    if (item.kind === "tickets" || item.count > 1) container.append(el("span", "bp-art-count", "×" + item.count));
  }
  function valid(data) {
    return data && ["active", "expired", "none"].includes(data.status) && hasCount(data.xp) && data.xp <= 1000
      && Array.isArray(data.rewards) && data.rewards.length === 10 && data.rewards.every((r, i) => r && r.level === i+1
        && ["tickets", "case", "badge"].includes(r.kind) && hasCount(r.count) && r.count >= 1 && r.count <= 5
        && hasCount(r.xp) && typeof r.name === "string")
      && Array.isArray(data.tasks) && data.tasks.length === 10 && data.tasks.every(t => t && typeof t.id === "string"
        && typeof t.title === "string" && typeof t.detail === "string" && hasCount(t.value) && hasCount(t.goal) && t.goal > 0 && t.value <= t.goal);
  }
  function revealSelection() {
    const node = levelNodes[selected - 1]?.button;
    if (!node || !route.clientWidth) return;
    const a = route.getBoundingClientRect(), b = node.getBoundingClientRect();
    if (b.left < a.left + 4 || b.right > a.right - 4) route.scrollLeft += b.left - a.left - 4;
  }
  function reward() { return state?.rewards[selected - 1]; }
  function status(text) { $("bp-status").textContent = text; }
  function notice(text, showLaunch = false) {
    $("bp-load-status").textContent = text;
    $("bp-launch").hidden = !showLaunch;
    $("bp-refresh").hidden = !signed();
  }
  function updateControls() {
    const item = reward();
    $("bp-refresh").setAttribute("aria-disabled", String(Boolean(busy)));
    $("bp-claim").disabled = Boolean(busy) || !isReady(item);
    $("bp-open").disabled = Boolean(busy) || !state || (!caseCount() && !retrySpin());
    if (item) $("bp-claim").textContent = item.claimed ? "✓ Получено"
      : !seasonActive() ? "Сезон завершён" : busy === "claim" ? "Получаем награду…"
        : isReady(item) ? "Забрать награду" : "Нужно " + number(item.xp) + " XP";
  }
  function renderReward() {
    const item = reward();
    if (!item) return;
    const card = $("bp-reward");
    card.classList.toggle("is-claimed", Boolean(item.claimed));
    card.classList.toggle("is-ready", isReady(item));
    art($("bp-reward-art"), item);
    $("bp-reward-title").textContent = item.name;
    $("bp-reward-kicker").textContent = "Уровень " + item.level + " / " + number(item.xp) + " XP";
    const needed = item.xp - state.xp;
    let hint;
    if (item.claimed) hint = item.kind === "case" ? "Открытие добавлено в запас кейсов." : "Награда сохранена в аккаунте.";
    else if (!seasonActive()) hint = "Получение наград сезона закрыто.";
    else if (!isReady(item)) hint = needed > 0 ? "До награды ещё " + number(needed) + " XP." : "Награда пока недоступна.";
    else if (item.kind === "case") hint = "Открытие не тратит ежедневную попытку.";
    else if (item.kind === "tickets" && state.giveaway_open === false) hint = "Билеты сохранятся до вступления в следующий розыгрыш.";
    else hint = "Награда доступна.";
    $("bp-reward-hint").textContent = hint;
    updateControls();
  }
  function markSelection() {
    levelNodes.forEach(({button}, i) => button.setAttribute("aria-pressed", String(i + 1 === selected)));
  }
  function renderRoute() {
    if (!levelNodes.length) {
      levelNodes = state.rewards.map(item => {
        const button = el("button", "bp-level");
        const art = el("span", "bp-level-art"), label = el("span", "bp-level-state");
        button.type = "button";
        button.dataset.bpLevel = String(item.level);
        button.setAttribute("aria-controls", "bp-reward");
        button.append(el("span", "bp-level-number", "Ур. " + String(item.level).padStart(2, "0")), art, label);
        return {button, art, label};
      });
      route.replaceChildren(...levelNodes.map(({button}) => button));
    }
    state.rewards.forEach((item, i) => {
      const {button, art: image, label} = levelNodes[i];
      button.classList.toggle("is-ready", isReady(item));
      button.classList.toggle("is-claimed", Boolean(item.claimed));
      button.classList.toggle("is-special", item.kind !== "tickets");
      const text = item.claimed ? "Получено" : isReady(item) ? "Доступно" : seasonActive() ? number(item.xp) + " XP" : "Закрыто";
      button.setAttribute("aria-label", "Уровень " + item.level + ": " + item.name + ". " + text);
      label.textContent = item.claimed ? "✓ " + text : text;
      art(image, item);
    });
    markSelection();
  }
  function taskKind(id) {
    if (id.startsWith("level_")) return "level";
    if (id.startsWith("quiz_")) return "quiz";
    if (id.startsWith("chest_")) return "chest";
    return "case";
  }
  function renderTasks() {
    const tasks = state.tasks.filter(t => filter === "all" || (filter === "done" ? t.done : !t.done));
    $("bp-tasks").replaceChildren(...tasks.map(t => {
      const row = el("li", "bp-task" + (t.done ? " is-done" : ""));
      row.dataset.task = t.id;
      const mark = el("span", "bp-task-icon");
      mark.setAttribute("aria-hidden", "true");
      if (t.done) mark.textContent = "✓";
      else mark.append(icon(taskKind(t.id)));
      const copy = el("div", "bp-task-copy"), line = el("div", "bp-task-progress"), bar = el("span"), fill = el("i");
      fill.style.width = t.value / t.goal * 100 + "%";
      bar.setAttribute("aria-hidden", "true");
      bar.append(fill);
      line.append(bar, el("small", "", t.done ? "Выполнено" : t.value + " / " + t.goal));
      copy.append(el("h3", "bp-task-title", t.title), el("p", "bp-task-detail", t.detail), line);
      const xp = hasCount(t.xp) ? t.xp : 100;
      row.append(mark, copy, el("span", "bp-task-xp", (t.done ? "" : "+") + number(xp) + " XP"));
      return row;
    }));
    $("bp-empty").textContent = tasks.length ? "" : filter === "done"
      ? seasonActive() ? "Пока нет выполненных заданий. Начни с ежедневного кейса." : "Нет выполненных заданий в этом сезоне."
      : state.rewards.some(isReady) ? "Все задания выполнены. Забери доступные награды." : "Все задания выполнены.";
    root.querySelectorAll("[data-bp-filter]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.bpFilter === filter)));
  }
  function renderInventory() {
    $("bp-balance").textContent = hasCount(state.remaining) ? "Доступно: " + number(state.remaining) : "Баланс недоступен.";
    $("bp-open").textContent = retrySpin() ? "Повторить открытие" : "Открыть кейс";
    $("bp-open-note").textContent = retrySpin() ? "Повтор открытия не спишет кейс дважды." : "";
    const known = hasCount(state.pending_tickets);
    $("bp-ticket-bank").hidden = !known && state.giveaway_open !== false;
    $("bp-pending-tickets").textContent = known ? number(state.pending_tickets) : "";
    $("bp-ticket-note").textContent = state.giveaway_open === false
      ? "Сейчас нет розыгрыша. Билеты зачислятся автоматически, когда вступишь в следующий."
      : "Билеты зачислятся автоматически, когда вступишь в открытый розыгрыш.";
    $("bp-badges").textContent = Array.isArray(state.badges) && state.badges.length ? "Твои значки: " + state.badges.join(", ") : "";
  }
  function render() {
    const started = state && state.status !== "none";
    $("bp-content").hidden = !state;
    $("bp-progress").hidden = !started;
    $("bp-rewards").hidden = !started;
    $("bp-missions").hidden = !started;
    $("bp-jump").hidden = !seasonActive() || state.tasks.every(task => task.done);
    updateControls();
    if (!state) return;
    renderInventory();
    if (!started) return;
    const next = state.rewards.find(r => r.xp > state.xp);
    const shouldReveal = selected === null;
    if (shouldReveal) selected = (state.rewards.find(isReady) || next || state.rewards[9]).level;
    const completed = state.tasks.filter(task => task.done).length;
    const ready = state.rewards.filter(isReady).length;
    const allClaimed = state.rewards.every(item => item.claimed);
    const day = state.days_left;
    const level = hasCount(state.level) ? state.level : Math.floor(state.xp / 100);
    $("bp-xp").replaceChildren(document.createTextNode(number(state.xp) + " "), el("small", "", "/ 1 000 XP"));
    $("bp-meter").setAttribute("aria-valuenow", String(state.xp));
    $("bp-xp-fill").style.width = state.xp / 10 + "%";
    $("bp-level-copy").textContent = level > 0 ? "Уровень " + level + " из 10" : "До 1-го уровня";
    $("bp-days").textContent = !seasonActive() ? "Сезон завершён" : !hasCount(day) ? "Сезон активен" : day === 0 ? "Последний день"
      : number(day) + " " + ({one: "день", few: "дня", many: "дней", other: "дня"})[days.select(day)];
    $("bp-next-copy").textContent = !seasonActive() ? "Результаты сезона" : allClaimed ? "Все награды получены"
      : next ? "До следующей награды " + number(next.xp - state.xp) + " XP" : "Все 10 уровней открыты";
    $("bp-reward-count").textContent = ready ? "Можно забрать: " + ready : "10 уровней";
    $("bp-task-count").textContent = completed + " из 10";
    $("bp-live-actions").hidden = !seasonActive() || completed === 10;
    renderRoute();
    renderReward();
    renderTasks();
    if (shouldReveal) requestAnimationFrame(revealSelection);
  }
  async function request(action, extra = {}) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const response = await fetch(API.replace(/\/$/, "") + "/api/battle-pass", {
        method: "POST", signal: ctl.signal, headers: {"Content-Type": "application/json", "ngrok-skip-browser-warning": "1"},
        body: JSON.stringify({initData: tg.initData, action, ...extra}),
      });
      let data;
      try { data = await response.json(); } catch (error) { if (error.name === "AbortError") throw error; }
      if (!response.ok || data?.error) throw Object.assign(new Error(typeof data?.error === "string" ? data.error
        : "Не удалось загрузить пропуск. Нажми «Обновить»."), {httpStatus: response.status});
      if (!valid(data?.battlepass)) throw new Error("Не удалось прочитать прогресс. Нажми «Обновить».");
      if (!state || state.season !== data.battlepass.season) {
        selected = null;
        filter = "all";
        status("");
      }
      state = data.battlepass;
      return data;
    } finally { clearTimeout(timer); }
  }
  function errorText(error, claim = false) {
    if (error.name === "AbortError") return claim ? "Ответ не получен. Повтори: награда не выдастся дважды."
      : "Сервер не ответил. Нажми «Обновить».";
    if (error instanceof TypeError) return claim ? "Не удалось связаться с ботом. Попробуй забрать награду ещё раз."
      : "Не удалось связаться с ботом. Нажми «Обновить».";
    return error.message;
  }
  function authError(error) { return error.httpStatus === 401 || error.httpStatus === 403; }
  function finish() {
    busy = "";
    render();
    if (refreshQueued) {
      refreshQueued = false;
      refresh();
    }
  }
  async function refresh() {
    if (busy) return;
    if (!signed()) {
      state = null;
      notice("Чтобы увидеть прогресс, открой пропуск через бота.", true);
      render();
      return;
    }
    busy = "state";
    if (!state) notice("Загружаем прогресс…");
    updateControls();
    try {
      await request("state");
      notice(state.status === "none" ? "Сезон ещё не начался." : "");
    } catch (error) {
      state = null;
      notice(errorText(error), authError(error));
    } finally { finish(); }
  }
  route.addEventListener("click", event => {
    const button = event.target.closest("[data-bp-level]");
    if (!button || !state || busy === "claim") return;
    const level = Number(button.dataset.bpLevel);
    if (level !== selected) status("");
    selected = level;
    markSelection();
    renderReward();
    revealSelection();
  });
  root.querySelector(".bp-filters").addEventListener("click", event => {
    const button = event.target.closest("[data-bp-filter]");
    if (!button || !state || !["all", "active", "done"].includes(button.dataset.bpFilter)) return;
    filter = button.dataset.bpFilter;
    renderTasks();
  });
  $("bp-claim").addEventListener("click", async () => {
    const item = reward();
    if (busy || !isReady(item) || !signed()) return;
    busy = "claim";
    status("");
    updateControls();
    try {
      const data = await request("claim", {level: item.level});
      status(typeof data.message === "string" && data.message ? data.message : "Награда получена.");
      if (typeof PROGRESS !== "undefined") PROGRESS.refresh();
    } catch (error) {
      if (authError(error)) {
        state = null;
        notice(errorText(error), true);
      } else status(errorText(error, true));
    } finally { finish(); }
  });
  $("bp-refresh").addEventListener("click", refresh);
  $("bp-jump").addEventListener("click", () => {
    const missions = $("bp-missions");
    missions.scrollIntoView({block: "start"});
    $("bp-daily").focus({preventScroll: true});
  });
  $("bp-daily").addEventListener("click", () => showTab("case"));
  $("bp-open").addEventListener("click", () => {
    if (busy || !signed() || !state || (!caseCount() && !retrySpin())) return;
    if ((typeof spinBusy !== "undefined" && spinBusy) || $("spin")?.disabled) {
      $("bp-open-note").textContent = "Дождись окончания прокрутки во вкладке «Кейс».";
      return;
    }
    showTab("case");
    spinLive(false, false, true);
  });
  for (const id of ["bp-launch", "bp-quiz", "bp-bot-tasks"]) {
    $(id).addEventListener("click", event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || typeof tg === "undefined" || typeof tg?.openTelegramLink !== "function") return;
      try {
        tg.openTelegramLink(event.currentTarget.href);
        event.preventDefault();
      } catch (_) { /* The fixed link still opens in a regular browser. */ }
    });
  }
  const game = new URL("game.html", location.href);
  game.search = location.search;
  game.searchParams.set("mode", "battlepass");
  game.searchParams.set("back", location.pathname + location.search + "#battlepass");
  $("bp-play").href = game.pathname + game.search;
  document.addEventListener("battlepass-tab", event => {
    if (event.detail === "battlepass") {
      if (state) requestAnimationFrame(revealSelection);
      refresh();
    }
  });
  document.addEventListener("battlepass-refresh", () => {
    if (busy) refreshQueued = true;
    else refresh();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !root.classList.contains("hidden")) refresh(); });
  if (!root.classList.contains("hidden")) refresh();
})();
