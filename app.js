// League of Counter — front end.
// Reads only the pre-computed files in data/ (champion totals). No keys, no player data.
(() => {
  "use strict";

  // ===== Rotating WebM background with cross-fade =====
  const BG_FILES = [
    "animated-bilgewater.webm", "animated-demacia.webm", "animated-freljord.webm",
    "animated-harrowing-2014.webm", "animated-ionia.webm", "animated-mount-targon.webm",
    "animated-piltover.webm", "animated-noxus.webm", "animated-shurima.webm",
    "animated-void.webm", "animated-zaun.webm",
  ];
  const vids = [document.getElementById("bg1"), document.getElementById("bg2")];
  let show = 0, bgIdx = Math.floor(Math.random() * BG_FILES.length);
  const setSrc = (v, src) => { v.src = src; v.load(); };
  const safePlay = v => { v.muted = true; v.play().catch(() => {}); };
  function crossfadeTo(next) {
    const hidden = show ^ 1;
    setSrc(vids[hidden], BG_FILES[next]);
    vids[hidden].onended = onEnded;
    safePlay(vids[hidden]);
    vids[hidden].classList.add("visible");
    vids[show].classList.remove("visible");
    show = hidden;
    bgIdx = next;
  }
  function onEnded() { crossfadeTo((bgIdx + 1) % BG_FILES.length); }
  setSrc(vids[show], BG_FILES[bgIdx]);
  vids[show].onended = onEnded;
  safePlay(vids[show]);

  // ===== Helpers =====
  const $ = id => document.getElementById(id);
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === "class") n.className = v;
      else if (k === "data") Object.assign(n.dataset, v);
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false && kid !== "") n.append(kid);
    return n;
  }
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const fmt = n => Number(n).toLocaleString("en-US");
  const ROLE_LABEL = { TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Support" };
  const ROLES = Object.keys(ROLE_LABEL); // every lane is always offered
  const BEST = 5;   // counters shown as pictures
  const SHOWN = 8;  // rows per column in the "All matchups" table before "Show all"

  async function getJson(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  }
  function ago(iso) {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
    return `${Math.round(m / 1440)} days ago`;
  }

  // ===== State =====
  let INDEX = null;          // data/index.json
  let BY_ID = new Map();
  let current = null;        // { champ, role, data, details, expanded: {} }

  // ===== Champion pictures =====
  // Your own file from images/ when there is one, otherwise Riot's splash art — so a
  // newly released champion shows up with a picture without anyone adding a file.
  const riotSplash = c => `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${c.key}_0.jpg`;
  const iconUrl = c => `https://ddragon.leagueoflegends.com/cdn/${INDEX.ddragon}/img/champion/${c.key}.png`;

  function splash(c, tip) {
    const img = el("img", {
      class: "splash", src: c.img || riotSplash(c), alt: c.name, loading: "lazy",
      width: 1215, height: 717, data: { name: tip || c.name },
    });
    if (c.img) img.onerror = () => { img.onerror = null; img.src = riotSplash(c); };
    return img;
  }
  function champIcon(c) {
    return el("img", { class: "champ-ico", src: iconUrl(c), alt: "", loading: "lazy", width: 40, height: 40 });
  }

  // Riot's data calls the patch "16.22"; the game client shows the same patch as
  // "26.22" (year-based numbering since 2025). Show the number players know.
  const clientPatch = p => { const [a, b] = String(p).split("."); return Number(a) >= 15 ? `${Number(a) + 10}.${b}` : p; };
  const patchLabel = () => INDEX.patches.map(clientPatch).join(" + ");

  // ===== Status line (in the footer) =====
  function renderStatus() {
    const s = $("status");
    s.textContent = "";
    if (!INDEX) return;
    if (!INDEX.matches) { s.textContent = "Collecting ranked games — counters will appear soon."; return; }
    s.append(
      `Patch ${patchLabel()} · ${fmt(INDEX.matches)} ranked games · updated ${ago(INDEX.updatedAt)}`,
      INDEX.sample ? el("span", { class: "sample" }, "SAMPLE DATA — not real match results") : ""
    );
  }

  // ===== Champion grid =====
  const gridSignature = () => INDEX.champions.map(c => `${c.id}:${c.img || ""}`).join(",");
  let shownSignature = "";

  function renderGrid() {
    shownSignature = gridSignature();
    $("image-container").replaceChildren(...INDEX.champions.map(c =>
      el("button", {
        class: "champ-tile", type: "button", "aria-label": c.name,
        data: { id: c.id, q: `${norm(c.name)} ${norm(c.key)}` },
      }, splash(c))
    ));
  }

  function filterGrid(text) {
    const q = norm(text);
    for (const t of document.querySelectorAll(".champ-tile")) t.hidden = !!q && !t.dataset.q.includes(q);
  }

  function rankedMatches(text, limit) {
    const q = norm(text);
    if (!q) return [];
    const starts = [], contains = [];
    for (const c of INDEX.champions) {
      const n = norm(c.name), k = norm(c.key);
      if (n.startsWith(q) || k.startsWith(q)) starts.push(c);
      else if (n.includes(q) || k.includes(q)) contains.push(c);
    }
    return [...starts, ...contains].slice(0, limit);
  }

  function findChamp(text) {
    const q = norm(text);
    if (!q) return null;
    return INDEX.champions.find(c => norm(c.name) === q || norm(c.key) === q) || rankedMatches(text, 1)[0] || null;
  }

  // ===== "All matchups" table =====
  function row(entry, pctValue, laneValue) {
    const c = BY_ID.get(entry.id);
    if (!c) return null;
    return el("button", { class: "counter-row", type: "button", data: { id: c.id }, title: `Show counters for ${c.name}` },
      champIcon(c),
      el("span", { class: "champ-name" }, c.name),
      el("span", { class: "wr" }, `${pctValue.toFixed(1)}%`),
      el("span", { class: "lane" }, laneValue == null ? "–" : `${laneValue.toFixed(0)}%`),
      el("span", { class: "n" }, fmt(entry.g))
    );
  }

  function column(key, title, sub, entries, toPct, toLane, laneHead) {
    const expanded = current.expanded[key];
    const rows = (expanded ? entries : entries.slice(0, SHOWN)).map(e => row(e, toPct(e), e.lane == null ? null : toLane(e))).filter(Boolean);
    return el("div", { class: "counter-col" },
      el("h3", null, title),
      el("p", { class: "col-sub" }, sub),
      rows.length
        ? [
            el("div", { class: "counter-head" }, el("span"), el("span"), el("span", null, "Win"), el("span", { title: laneHead }, "Lane"), el("span", null, "Games")),
            ...rows,
            entries.length > SHOWN && el("button", { class: "more", type: "button", data: { more: key } },
              expanded ? "Show fewer" : `Show all ${entries.length}`),
          ]
        : el("p", { class: "empty" }, "No clear matchups in the data yet.")
    );
  }

  // ===== Enemy champion + best counters =====
  function renderResult() {
    const box = $("result");
    const { champ, data } = current;
    const roles = Object.keys(data?.roles || {}); // most played first
    if (!ROLES.includes(current.role)) current.role = roles[0] || ROLES[0];
    const r = data?.roles?.[current.role] || null;
    const lane = ROLE_LABEL[current.role];

    // vs[] holds this champion's win rate against each opponent; "adj" is the same
    // number steadied for small samples and is what we rank by.
    // Normally only matchups with at least INDEX.minGames games count. In a lane the
    // champion is rarely played in there aren't enough of those, so we fall back to
    // every matchup we have and say clearly that it is a small sample.
    const known = e => BY_ID.has(e.id);
    const all = r ? r.vs.filter(known) : [];
    const solid = all.filter(e => e.g >= INDEX.minGames);
    const lowSample = solid.filter(e => e.adj < 50).length < BEST && all.length > solid.length;
    const pool = lowSample ? all : solid;
    const bad = pool.filter(e => e.adj < 50).sort((a, b) => a.adj - b.adj);
    const good = pool.filter(e => e.adj > 50).sort((a, b) => b.adj - a.adj);

    const picks = bad.slice(0, BEST).map(e => {
      const c = BY_ID.get(e.id), wr = (100 - e.wr).toFixed(1);
      return el("button", { class: "counter-pick", type: "button", data: { id: c.id }, "aria-label": `${c.name}, wins ${wr}%` },
        splash(c, `${c.name} — wins ${wr}% of ${fmt(e.g)} games`));
    });

    const noData = !INDEX.matches ? "Still collecting ranked games — check back soon."
      : !r ? `No ranked games with ${champ.name} ${lane} yet — check back soon.`
      : `Not enough ${champ.name} ${lane} games for counters yet — check back soon.`;

    $("image-container").hidden = true;
    box.hidden = false;
    box.replaceChildren(...[
      el("div", { id: "spotlight" },
        el("p", { class: "label" }, "Enemy Champion"),
        splash(champ, r ? `${champ.name} ${lane} — ${r.wr.toFixed(1)}% win rate over ${fmt(r.games)} ${r.games === 1 ? "game" : "games"}` : champ.name),
        el("div", { class: "role-tabs" }, ROLES.map(role =>
          el("button", { type: "button", class: role === current.role ? "active" : "", data: { role } }, ROLE_LABEL[role])))
      ),
      el("div", { id: "counters" },
        el("p", { class: "label" }, "Best Counters"),
        picks.length ? el("div", { id: "counter-images" }, picks) : el("div", null, el("p", { class: "msg" }, noData)),
        picks.length > 0 && lowSample && el("div", null, el("p", { class: "msg note" },
          `Small sample — rough guide only`))
      ),
      (bad.length || good.length) > 0 && el("button", { class: "more", type: "button", data: { details: "1" } },
        current.details ? "Hide matchups" : "All matchups"),
      current.details && r && el("section", { id: "aggregate" },
        el("div", { class: "counter-cols" },
          column("bad", `Counters ${champ.name}`, `Best picks against ${champ.name} — their win rate`, bad,
            e => 100 - e.wr, e => 100 - e.lane, "How often they are ahead after the laning phase"),
          column("good", `${champ.name} counters`, `${champ.name} wins most against these`, good,
            e => e.wr, e => e.lane, `How often ${champ.name} is ahead after the laning phase`)
        ),
        el("p", { class: "fineprint" },
          `Same-role matchups from ranked solo queue, patch ${patchLabel()}. Ranked by win rate adjusted for sample size; ` +
          (lowSample ? `this lane has few games, so matchups with as few as ${INDEX.lowGames || 1} games are included.`
                     : `matchups with fewer than ${INDEX.minGames} games are hidden.`))
      ),
    ].filter(Boolean));
  }

  const setHash = () => history.replaceState(null, "",
    current ? `#${current.champ.key}${current.role ? "/" + current.role.toLowerCase() : ""}` : location.pathname);

  async function select(champ, role, { push = true, keep = false } = {}) {
    if (!champ) return;
    const prev = current;
    current = {
      champ, role: role || prev?.role, data: null,
      details: keep && prev ? prev.details : false,
      expanded: keep && prev ? prev.expanded : {},
    };
    let data = null;
    try { data = await getJson(`data/c/${champ.id}.json`); } catch { /* shown as "not enough data" */ }
    if (current.champ !== champ) return; // a newer click won
    current.data = data;
    // Opening a champion starts on their most played lane unless the lane we came
    // from has data for them too. (Lane buttons can still pick any lane afterwards.)
    if (!keep && !data?.roles?.[current.role]) current.role = Object.keys(data?.roles || {})[0];
    if (!keep) { $("search-bar").value = champ.name; closeSuggestions(); }
    renderResult();
    if (push) setHash();
    if (!keep) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    current = null;
    $("search-bar").value = "";
    closeSuggestions();
    filterGrid("");
    $("result").hidden = true;
    $("result").replaceChildren();
    $("image-container").hidden = false;
    setHash();
  }

  function fromHash() {
    const [key, role] = decodeURIComponent(location.hash.slice(1)).split("/");
    const champ = INDEX.champions.find(c => norm(c.key) === norm(key || ""));
    if (champ) select(champ, role ? role.toUpperCase() : undefined, { push: false });
  }

  // ===== Autocomplete =====
  let active = -1;
  function closeSuggestions() {
    $("suggestions").classList.remove("open");
    active = -1;
  }
  function renderSuggestions() {
    const box = $("suggestions"), text = $("search-bar").value.trim();
    const items = rankedMatches(text, 8);
    active = -1;
    if (!items.length) return closeSuggestions();
    const q = text.toLowerCase();
    box.replaceChildren(...items.map(c => {
      const at = c.name.toLowerCase().indexOf(q);
      return el("div", { class: "suggestion", data: { id: c.id } },
        at < 0 ? c.name : [c.name.slice(0, at), el("mark", null, c.name.slice(at, at + q.length)), c.name.slice(at + q.length)]);
    }));
    box.classList.add("open");
  }

  // ===== Wiring =====
  function wire() {
    const input = $("search-bar"), sug = $("suggestions");

    $("image-container").addEventListener("click", e => {
      const t = e.target.closest(".champ-tile");
      if (t) select(BY_ID.get(Number(t.dataset.id)));
    });

    $("result").addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.role) { current.role = b.dataset.role; current.expanded = {}; renderResult(); setHash(); }
      else if (b.dataset.details) { current.details = !current.details; renderResult(); }
      else if (b.dataset.more) { current.expanded[b.dataset.more] = !current.expanded[b.dataset.more]; renderResult(); }
      else if (b.dataset.id) select(BY_ID.get(Number(b.dataset.id)), current.role);
    });

    const generate = () => {
      const champ = findChamp(input.value);
      if (champ) return select(champ);
      if (!input.value.trim()) return;
      closeSuggestions();
      current = null;
      $("image-container").hidden = true;
      $("result").hidden = false;
      $("result").replaceChildren(el("p", { class: "msg" }, `No champion matches “${input.value.trim()}”.`));
    };

    input.addEventListener("input", () => {
      if (!current) filterGrid(input.value);
      renderSuggestions();
    });
    input.addEventListener("focus", () => { if (input.value.trim().length >= 2 && !current) renderSuggestions(); });
    input.addEventListener("blur", () => setTimeout(closeSuggestions, 120));
    input.addEventListener("keydown", e => {
      const items = [...sug.querySelectorAll(".suggestion")];
      const open = sug.classList.contains("open") && items.length;
      if (e.key === "Enter") {
        if (open && active >= 0) select(BY_ID.get(Number(items[active].dataset.id)));
        else generate();
        return;
      }
      if (e.key === "Escape") return closeSuggestions();
      if (!open || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle("active", i === active));
    });
    sug.addEventListener("mousedown", e => {
      const it = e.target.closest(".suggestion");
      if (it) { e.preventDefault(); select(BY_ID.get(Number(it.dataset.id))); }
    });

    $("generate-btn").addEventListener("click", generate);
    $("reset-btn").addEventListener("click", () => { reset(); input.focus(); });
    window.addEventListener("hashchange", fromHash);

    // Floating tooltip that follows the cursor
    const tip = el("div", { id: "champ-tooltip" });
    document.body.append(tip);
    document.addEventListener("mouseover", e => {
      const img = e.target.closest?.("img[data-name]");
      tip.classList.toggle("on", !!img);
      if (img) tip.textContent = img.dataset.name;
    });
    document.addEventListener("mousemove", e => {
      if (!tip.classList.contains("on")) return;
      const rect = tip.getBoundingClientRect();
      let x = e.clientX + 8, y = e.clientY - 28;
      if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - 8;
      if (y < 0) y = e.clientY + 20;
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    });
  }

  async function loadIndex() {
    INDEX = await getJson("data/index.json");
    BY_ID = new Map(INDEX.champions.map(c => [c.id, c]));
  }

  (async function init() {
    $("year").textContent = new Date().getFullYear();
    try {
      await loadIndex();
    } catch {
      $("status").textContent = "Counter data isn't available yet — the collector hasn't published anything.";
      return;
    }
    renderGrid();
    renderStatus();
    wire();
    fromHash();

    // Pick up new data without a reload (the collector republishes every few minutes).
    setInterval(async () => {
      try {
        const before = INDEX.updatedAt;
        await loadIndex();
        if (gridSignature() !== shownSignature) { renderGrid(); if (!current) filterGrid($("search-bar").value); }
        if (INDEX.updatedAt !== before && current) {
          const champ = BY_ID.get(current.champ.id);
          if (champ) select(champ, current.role, { push: false, keep: true });
        }
      } catch { /* keep showing what we have */ }
      renderStatus();
    }, 5 * 60 * 1000);
  })();
})();
