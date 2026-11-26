/* Production battle pass: display server state; never award in the browser. */
(function () {
  "use strict";
  const root = document.getElementById("tab-battlepass");
  if (!root || window.BP_LOCAL_PREVIEW === true) return;
  const $ = id => document.getElementById(id);
  let state = null, selected = null, filter = "all", busy = false;
  const number = n => new Intl.NumberFormat("ru-RU").format(n);
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function status(text) { $("bp-status").textContent = text || ""; }
  function art(container, item) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key,value] of Object.entries({viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"1.5",class:"bp-art-icon","aria-hidden":"true",focusable:"false"})) svg.setAttribute(key,value);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", item.kind === "tickets" ? "M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4ZM15 8v8" : item.kind === "case" ? "m3 7 9-4 9 4v10l-9 4-9-4Zm0 0 9 4 9-4M12 11v10M7.5 5l9 4v5" : "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z");
    svg.append(path); container.replaceChildren(svg);
    if (item.kind === "tickets" || item.count > 1) container.append(el("span", "bp-art-count", "×"+item.count));
  }
  function valid(data) {
    return data && typeof data === "object" && Array.isArray(data.tasks) && data.tasks.length === 10 && Array.isArray(data.rewards) && data.rewards.length === 10
      && Number.isInteger(data.xp) && data.xp >= 0 && data.xp <= 1000
      && data.rewards.every((r,i) => r && r.level === i+1 && ["tickets","case","badge"].includes(r.kind) && Number.isInteger(r.count) && r.count > 0 && r.count <= 5)
      && data.tasks.every(t => t && typeof t.id === "string" && Number.isInteger(t.value) && Number.isInteger(t.goal) && t.goal > 0 && t.value >= 0 && t.value <= t.goal);
  }
  function revealSelection() {
    const route=$("bp-route"), node=route.querySelector('[aria-pressed="true"]');
    if (!node || !route.clientWidth) return;
    const a=route.getBoundingClientRect(), b=node.getBoundingClientRect();
    if (b.left<a.left) route.scrollLeft-=a.left-b.left+2;
    else if (b.right>a.right) route.scrollLeft+=b.right-a.right+2;
  }
  function reward() { return state && state.rewards.find(r => r.level === selected); }
  function renderReward() {
    const r=reward(); if (!r) return;
    art($("bp-reward-art"), r); $("bp-reward-title").textContent=r.name;
    $("bp-reward-kicker").textContent="Уровень "+r.level+" · "+number(r.xp)+" XP";
    $("bp-reward-hint").textContent=r.claimed ? "Награда сохранена в аккаунте." : state.status !== "active" ? "Сезон завершён." : r.ready ? r.kind === "case" ? "Тот же ежедневный набор, отдельное открытие." : "Награда доступна." : "До награды ещё "+number(Math.max(0,r.xp-state.xp))+" XP.";
    $("bp-claim").disabled=busy || !r.ready;
    $("bp-claim").textContent=r.claimed ? "✓ Получено" : state.status !== "active" ? "Сезон завершён" : r.ready ? "Забрать награду" : "Нужно "+number(r.xp)+" XP";
    $("bp-reward").classList.toggle("is-claimed",Boolean(r.claimed));
  }
  function renderTasks() {
    const tasks=state.tasks.filter(t => filter === "all" || (filter === "done" ? t.done : !t.done));
    $("bp-tasks").replaceChildren(...tasks.map(t => {
      const row=el("li","bp-task"+(t.done?" is-done":"")); row.dataset.task=t.id;
      const icon=el("span","bp-task-icon",t.done?"✓":"·"); icon.setAttribute("aria-hidden","true");
      const copy=el("div","bp-task-copy"), line=el("div","bp-task-progress"), bar=el("span"), fill=el("i");
      fill.style.width=Math.min(100,t.value/t.goal*100)+"%"; bar.setAttribute("aria-hidden","true"); bar.append(fill);
      line.append(bar,el("small","",t.value+"/"+t.goal)); copy.append(el("h3","bp-task-title",t.title),el("p","bp-task-detail",t.detail),line);
      row.append(icon,copy,el("span","bp-task-xp",t.done?"100 XP":"+100 XP")); return row;
    }));
    $("bp-empty").classList.toggle("hidden",tasks.length>0);
    $("bp-empty").textContent=filter === "done" ? "Пока нет выполненных заданий. Начни с ежедневного кейса." : "Все задания выполнены. Забери доступные награды.";
    root.querySelectorAll("[data-bp-filter]").forEach(b => b.setAttribute("aria-pressed",String(b.dataset.bpFilter===filter)));
  }
  function render() {
    if (!state) return;
    if (!selected) selected=(state.rewards.find(r=>r.ready)||state.rewards.find(r=>r.xp>state.xp)||state.rewards[9]).level;
    $("bp-xp").replaceChildren(document.createTextNode(number(state.xp)+" "),el("small","","/ 1 000 XP"));
    $("bp-meter").setAttribute("aria-valuenow",String(state.xp)); $("bp-xp-fill").style.width=state.xp/10+"%";
    $("bp-level-copy").textContent=state.status !== "active" ? "Сезон завершён" : state.level === 10 ? "Все 10 этапов открыты" : "Уровень "+state.level+" из 10";
    $("bp-days").textContent=state.status === "active" ? "Осталось "+state.days_left+" дн." : "Завершён";
    const next=state.rewards.find(r=>r.xp>state.xp);
    $("bp-next-copy").textContent=state.status !== "active" ? "Результаты сезона" : next ? "До следующей награды "+(next.xp-state.xp)+" XP" : "Все задания выполнены";
    $("bp-task-count").textContent=state.completed+" из 10";
    $("bp-reward-count").textContent=state.ready ? "Доступно: "+state.ready : "10 этапов";
    $("bp-route").replaceChildren(...state.rewards.map(r=>{
      const b=el("button","bp-level"+(r.ready?" is-ready":"")+(r.claimed?" is-claimed":"")+(r.kind!=="tickets"?" is-special":""));
      b.type="button";b.dataset.bpLevel=String(r.level);b.setAttribute("aria-pressed",String(r.level===selected));
      const text=r.claimed?"Получено":r.ready?"Забрать":r.xp+" XP";
      b.setAttribute("aria-label","Уровень "+r.level+": "+r.name+". "+text);
      const image=el("span","bp-level-art");art(image,r);b.append(el("span","bp-level-number","Ур. "+r.level),image,el("span","bp-level-state",text));return b;
    }));
    const remaining=Number.isInteger(state.remaining)&&state.remaining>=0?state.remaining:0;
    $("bp-balance").textContent="Открытия пропуска: "+remaining;
    $("bp-open").disabled=busy||remaining<1;
    $("bp-badges").textContent=Array.isArray(state.badges)&&state.badges.length ? "Твои значки: "+state.badges.join(" · ") : "";
    $("bp-refresh").disabled=busy;
    renderReward();renderTasks();requestAnimationFrame(revealSelection);
  }
  async function request(action, extra={}) {
    if (!tg || !tg.initData) throw new Error("Открой пропуск через бота в Telegram.");
    const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),15000);
    try {
      const r=await fetch(API.replace(/\/$/,"")+"/api/battle-pass",{method:"POST",signal:ctl.signal,headers:{"Content-Type":"application/json","ngrok-skip-browser-warning":"1"},body:JSON.stringify({initData:tg.initData,action,...extra})});
      const data=await r.json();
      if (!r.ok||!data||data.error) throw new Error(data&&data.error||"Обнови Runner на телефоне и попробуй снова.");
      if (!valid(data.battlepass)) throw new Error("Не удалось прочитать прогресс. Обнови страницу.");
      state=data.battlepass;return data;
    } finally {clearTimeout(timer);}
  }
  async function refresh() {
    if (busy) return;busy=true;render();
    try {await request("state");status("");}
    catch(e){state=null;status(e.name==="AbortError"?"Сервер не ответил. Нажми «Обновить».":e.message);$("bp-claim").disabled=true;$("bp-open").disabled=true;}
    finally{busy=false;render();}
  }
  $("bp-route").addEventListener("click",e=>{const b=e.target.closest("[data-bp-level]");if(!b||!state)return;selected=Number(b.dataset.bpLevel);render();});
  root.querySelector(".bp-filters").addEventListener("click",e=>{const b=e.target.closest("[data-bp-filter]");if(!b||!state||!["all","active","done"].includes(b.dataset.bpFilter))return;filter=b.dataset.bpFilter;renderTasks();});
  $("bp-claim").addEventListener("click",async()=>{
    const item=reward();if(busy||!item||!item.ready)return;busy=true;render();
    try{const data=await request("claim",{level:item.level});status(data.message);if(typeof PROGRESS!=="undefined")PROGRESS.refresh();}
    catch(e){status(e.name==="AbortError"?"Ответ не получен. Повтори: награда не выдастся дважды.":e.message);}
    finally{busy=false;render();}
  });
  $("bp-refresh").addEventListener("click",refresh);
  $("bp-open").addEventListener("click",()=>{if(busy||!state||state.remaining<1)return;showTab("case");spinLive(false,false,true);});
  const game=new URL("game.html",location.href);game.search=location.search;game.searchParams.set("mode","battlepass");game.searchParams.set("back",location.pathname+location.search+"#battlepass");$("bp-play").href=game.pathname+game.search;
  document.addEventListener("battlepass-tab",e=>{if(e.detail==="battlepass"){refresh();}});
  document.addEventListener("battlepass-refresh",()=>refresh());
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&!root.classList.contains("hidden"))refresh();});
  if (!root.classList.contains("hidden")) refresh();
})();
