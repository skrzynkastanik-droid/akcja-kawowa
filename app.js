/* =============================================
   AKCJA KAWOWA — app.js
   Data layer: Supabase (zamiast data.json)
   ============================================= */

/* ---------- 0. KONFIGURACJA SUPABASE ---------- */
const SUPABASE_URL = 'https://uhatlvlnlhzlknjlaqpd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Bo_PxUx9tuojImnHrsOA5g_yOah2Wj1';
const STORAGE_BUCKET = 'coffee-photos';

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

/* Supabase REST helpers */
const sb = {
  async get(table, params = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers });
    if (!res.ok) throw new Error(`GET ${table} failed: ${res.status}`);
    return res.json();
  },
  async post(table, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${table} failed: ${res.status}`);
    return res.json();
  },
  async patch(table, filter, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'PATCH', headers, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PATCH ${table} failed: ${res.status}`);
    return res.json();
  },
  async uploadPhoto(file, path) {
    const uploadHeaders = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': file.type,
      'Cache-Control': '3600',
    };
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`,
      { method: 'POST', headers: uploadHeaders, body: file }
    );
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
  },
};

/* ---------- 1. STAN APLIKACJI ---------- */
const state = {
  data: null,
  tab: 'losowanie',
  whoAmI: localStorage.getItem('akcja-kawowa-who') || null,
  draw: { stage: 'idle', winner: null, gifUrl: null },
  modal: null, // 'purchase' | 'rating' | null
  modalData: {},
  saving: false,
};

/* ---------- 2. ŁADOWANIE DANYCH ---------- */
async function loadData() {
  const [team, rounds, draws, purchases, ratings] = await Promise.all([
    sb.get('team', 'order=name'),
    sb.get('rounds', 'order=number.desc'),
    sb.get('draws', 'order=draw_date.desc'),
    sb.get('purchases', 'order=id'),
    sb.get('ratings', 'order=id'),
  ]);

  // Jeśli brak rund w bazie — utwórz rundę 1 jako bieżącą
  let activeRounds = rounds;
  if (activeRounds.length === 0) {
    const created = await sb.post('rounds', { number: 1, is_current: true });
    activeRounds = Array.isArray(created) ? created : [created];
  }

  const currentRound = activeRounds.find(r => r.is_current);

  // normalizujemy do struktury podobnej do data.json
  state.data = {
    team,
    currentRound: currentRound?.number ?? 1,
    rounds: activeRounds.map(r => ({
      number: r.number,
      draws: draws
        .filter(d => d.round_number === r.number)
        .map(d => ({ id: d.id, memberId: d.member_id, date: d.draw_date })),
    })),
    purchases: purchases.map(p => ({
      id: p.id, drawId: p.draw_id, brand: p.brand,
      variety: p.variety, price: p.price, photo: p.photo_url,
    })),
    ratings: ratings.map(r => ({
      purchaseId: r.purchase_id, memberId: r.member_id, score: r.score,
    })),
  };
}

/* ---------- 3. POMOCNICZE FUNKCJE ---------- */
const $ = (sel) => document.querySelector(sel);
const byId = (list, id) => list.find(x => x.id === id);
const memberById = (id) => byId(state.data.team, id);
const initials = (name) => name.slice(0, 2).toUpperCase();
const uid = () => Math.random().toString(36).slice(2, 10);
const buyVerb = (member) => member?.gender === 'M' ? 'kupił' : 'kupiła';

function paidThisRound() {
  const round = state.data.rounds.find(r => r.number === state.data.currentRound);
  if (!round) return [];
  return round.draws.map(d => d.memberId);
}

function inGame() {
  const paid = paidThisRound();
  return state.data.team.filter(p => p.active && !p.today_off && !paid.includes(p.id));
}

function out() {
  const paid = paidThisRound();
  return state.data.team.filter(p => paid.includes(p.id));
}

function ho() {
  return state.data.team.filter(p => p.active && p.today_off);
}

function avgScore(purchaseId) {
  const rs = state.data.ratings.filter(r => r.purchaseId === purchaseId);
  if (rs.length === 0) return null;
  return rs.reduce((s, r) => s + r.score, 0) / rs.length;
}

function rankedPurchases() {
  return state.data.purchases
    .map(p => ({ ...p, score: avgScore(p.id), votes: state.data.ratings.filter(r => r.purchaseId === p.id).length }))
    .filter(p => p.score !== null)
    .sort((a, b) => b.score - a.score);
}

function purchaseForDraw(drawId) {
  return state.data.purchases.find(p => p.drawId === drawId);
}

function myRatingForPurchase(purchaseId) {
  return state.data.ratings.find(r => r.purchaseId === purchaseId && r.memberId === state.whoAmI);
}

/* ---------- 4. RENDER GŁÓWNY ---------- */
function render() {
  if (!state.whoAmI) {
    $('#app').innerHTML = renderWhoAmI();
    attachEvents();
    return;
  }

  $('#app').innerHTML = `
    ${renderTopbar()}
    ${renderTabs()}
    <div id="tab-content" class="fade-in">
      ${renderTab()}
    </div>
    ${state.modal ? renderModal() : ''}
  `;
  attachEvents();
}

/* ---------- EKRAN WYBORU OSOBY ---------- */
function renderWhoAmI() {
  return `
    <div class="whoami-screen">
      <img src="lockup-poziom-6a.svg" alt="Kawa prawem, nie towarem" style="width:360px; margin-bottom:20px">
      <div class="mono" style="margin-bottom:32px; color:var(--ink-soft)">zaloguj się</div>
      <div class="whoami-list">
        ${state.data.team.filter(p => p.active).map(p => `
          <button class="whoami-btn" data-who="${p.id}">
            <div class="avatar avatar-lg">${initials(p.name)}</div>
            <span>${p.name}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderTopbar() {
  const me = memberById(state.whoAmI);
  return `
    <div class="topbar">
      <div class="brand">
        <img src="lockup-poziom-6a.svg" alt="Kawa prawem, nie towarem" style="height:70px">
        <div class="subtitle">runda ${state.data.currentRound} · ${inGame().length} z ${state.data.team.filter(p => p.active).length} w grze</div>
      </div>
      <div class="who-am-i">
        <span class="label">kawosz:</span>
        <select id="who-select">
          ${state.data.team.map(p => `
            <option value="${p.id}" ${p.id === state.whoAmI ? 'selected' : ''}>${p.name}</option>
          `).join('')}
        </select>
      </div>
    </div>
  `;
}

function renderTabs() {
  const tabs = [
    { id: 'losowanie',  label: 'Losowanie' },
    { id: 'zespol',     label: 'Zespół' },
    { id: 'historia',   label: 'Historia' },
    { id: 'statystyki', label: 'Statystyki' },
    { id: 'ranking',    label: 'Ranking' },
  ];
  return `
    <div class="tabs">
      ${tabs.map(t => `
        <button class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">
          ${t.label}
        </button>
      `).join('')}
    </div>
  `;
}

function renderTab() {
  switch (state.tab) {
    case 'losowanie':  return renderLosowanie();
    case 'zespol':     return renderZespol();
    case 'historia':   return renderHistoria();
    case 'statystyki': return renderStatystyki();
    case 'ranking':    return renderRanking();
  }
  return '';
}

/* ---------- 5. ZAKŁADKA: LOSOWANIE ---------- */
function renderLosowanie() {
  if (state.draw.stage === 'reel')  return renderDrawReel();
  if (state.draw.stage === 'wynik') return renderDrawResult();
  return renderDrawIdle();
}

function renderDrawIdle() {
  const players = inGame();
  const last = state.data.rounds[0]?.draws[0];
  const lastMember = last ? memberById(last.memberId) : null;
  const lastPurchase = last ? purchaseForDraw(last.id) : null;
  const canDraw = players.length > 0;

  return `
    <div class="draw-stage">
      <div class="draw-main">
        <button class="btn-draw" id="btn-draw" ${canDraw ? '' : 'disabled'}>
          LOSUJ
        </button>
        <div class="draw-hint">
          ${canDraw ? '' : 'Runda zakończona'}
        </div>
        ${!canDraw ? `
          <button class="btn btn-primary" id="btn-new-round" style="margin-top:16px">
            ↻ Nowa runda (${state.data.currentRound + 1})
          </button>
        ` : ''}
      </div>

      <div class="round-info">
        <div class="card">
          <h3>W grze w tej rundzie <span class="mono">(${players.length})</span></h3>
          <div class="member-list">
            ${players.map(p => `
              <div class="member-row">
                <div class="avatar">${initials(p.name)}</div>
                <span class="name">${p.name}</span>
                <span class="badge badge-game">w grze</span>
              </div>
            `).join('') || '<div class="mono" style="padding:8px">Brak. Runda się skończyła</div>'}
          </div>

          ${out().length ? `
            <hr class="divider"/>
            <h3>Wylosowani w tej rundzie <span class="mono">(${out().length})</span></h3>
            <div class="member-list">
              ${out().map(p => `
                <div class="member-row is-out">
                  <div class="avatar">${initials(p.name)}</div>
                  <span class="name">${p.name}</span>
                  <span class="badge badge-out">wylosowany</span>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${ho().length ? `
            <hr class="divider"/>
            <h3>Dziś nieobecni <span class="mono">(${ho().length})</span></h3>
            <div class="member-list">
              ${ho().map(p => `
                <div class="member-row is-ho">
                  <div class="avatar">${initials(p.name)}</div>
                  <span class="name">${p.name}</span>
                  <span class="badge badge-ho">nieobecny</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        ${lastMember && lastPurchase ? `
          <div class="last-result">
            <div class="avatar avatar-lg" style="background: var(--coffee); color: var(--paper);">
              ${initials(lastMember.name)}
            </div>
            <div class="info">
              <div class="who">${lastMember.name} ${buyVerb(lastMember)}</div>
              <div style="font-size:13px; color:var(--ink-2)">
                ${lastPurchase.brand} · ${lastPurchase.variety} · ${lastPurchase.price} zł
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderDrawReel() {
  const players = inGame();
  const long = [...players, ...players, ...players, ...players, ...players];
  return `
    <div class="draw-stage" style="grid-template-columns: 1fr">
      <div class="draw-main">
        <div class="mono" style="margin-bottom: 8px; color: var(--coffee);">● TRWA LOSOWANIE ●</div>
        <div class="draw-headline">kto to będzie...?</div>
        <div class="reel">
          <div class="reel-line"></div>
          <div class="reel-pointer-top"></div>
          <div class="reel-pointer-bottom"></div>
          <div class="reel-track" id="reel-track">
            ${long.map(p => `<div class="reel-name">${p.name}</div>`).join('')}
          </div>
        </div>
        <div class="draw-hint">drum roll... 🥁</div>
      </div>
    </div>
  `;
}

function renderDrawResult() {
  const winner = memberById(state.draw.winner);
  return `
    <div class="result fade-in" id="result-stage">
      <div class="mono">★ wynik losowania · runda ${state.data.currentRound} ★</div>
      <div class="avatar avatar-xl pop" style="background: var(--coffee); color: var(--paper); margin: 16px auto;">
        ${initials(winner.name)}
      </div>
      <div class="result-name">${winner.name}!</div>
      <div class="result-tagline">kupujesz 1kg kawy ziarnistej</div>
      <div class="result-meta">
        <span class="chip">📅 do końca tygodnia</span>
        <span class="chip">📷 zdjęcie opakowania obowiązkowe</span>
      </div>
      <div class="result-gif" id="gif-slot">
        <span class="mono">ładuję mem...</span>
      </div>
      <div class="result-actions">
        <button class="btn btn-primary" id="btn-register">📷 zarejestruj zakup</button>
        <button class="btn btn-ghost" id="btn-back">← powrót</button>
      </div>
    </div>
  `;
}

/* ---------- 6. ZAKŁADKA: ZESPÓŁ ---------- */
function renderZespol() {
  const paid = paidThisRound();
  return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
      <h2>Zespół (${state.data.team.filter(p => p.active).length})</h2>
      <button class="btn btn-primary" id="btn-open-add-member">+ dodaj uczestnika</button>
    </div>
    <table class="data">
      <thead>
        <tr>
          <th></th>
          <th>imię</th>
          <th>ulubiona kawa</th>
          <th>status w rundzie</th>
          <th>dziś w biurze</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${state.data.team.filter(p => p.active).map(p => `
          <tr>
            <td style="width:48px"><div class="avatar">${initials(p.name)}</div></td>
            <td><strong>${p.name}</strong></td>
            <td><span class="mono">${p.drink}</span></td>
            <td>
              ${paid.includes(p.id)
                ? '<span class="badge badge-out">wylosowany</span>'
                : p.today_off
                ? '<span class="badge badge-ho">nieobecny</span>'
                : '<span class="badge badge-game">w grze</span>'}
            </td>
            <td>
              <div class="presence-toggle">
                <button class="presence-btn ${!p.today_off ? 'active-here' : ''}"
                  data-presence="${p.id}" data-off="false">✓ W biurze</button>
                <button class="presence-btn ${p.today_off ? 'active-off' : ''}"
                  data-presence="${p.id}" data-off="true">✕ Nieobecny</button>
              </div>
            </td>
            <td style="width:40px; text-align:center">
              <button class="btn-deactivate" data-deactivate="${p.id}" title="Usuń uczestnika">✕</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

/* ---------- 7. ZAKŁADKA: HISTORIA ---------- */
function renderHistoria() {
  return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2>Historia losowań</h2>
    </div>
    ${state.data.rounds.map(round => {
      const completed = round.draws.length === state.data.team.filter(p => p.active).length;
      return `
        <div class="history-section">
          <div class="label">runda ${round.number} ${completed ? '(zakończona)' : '— bieżąca'} · ${round.draws.length} losowań</div>
          ${round.draws.map(d => {
            const m = memberById(d.memberId);
            const p = purchaseForDraw(d.id);
            const score = p ? avgScore(p.id) : null;
            return `
              <div class="history-row ${completed ? 'is-completed' : ''}">
                <span class="date">${d.date}</span>
                <div class="avatar" style="width:30px; height:30px; font-size:11px">${initials(m.name)}</div>
                <span class="who">${m.name}</span>
                <span class="what">${p ? `${p.brand} · ${p.variety}` : '<em style="color:var(--ink-soft)">brak zakupu</em>'}</span>
                <span class="price">${p ? `${p.price} zł` : '—'}</span>
                <span class="score">${score !== null ? score.toFixed(1) : '—'}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('')}
  `;
}

/* ---------- 8. ZAKŁADKA: STATYSTYKI ---------- */
function renderStatystyki() {
  const purchases = state.data.purchases;
  if (purchases.length === 0) return '<div class="mono" style="padding:40px;text-align:center">brak danych</div>';

  const total = purchases.reduce((s, p) => s + p.price, 0);
  const avg = total / purchases.length;
  const ratings = state.data.ratings;
  const avgRating = ratings.length ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length : 0;
  const minP = Math.min(...purchases.map(p => p.price));
  const maxP = Math.max(...purchases.map(p => p.price));
  const cupsPerKg = 140;
  const cups = purchases.length * cupsPerKg;
  const priciest = purchases.reduce((a, b) => b.price > a.price ? b : a);
  const ranked = rankedPurchases();
  const best = ranked[0];

  return `
    <h2 style="margin-bottom:16px">Statystyki</h2>
    <div class="kpi-grid">
      <div class="kpi accent">
        <div class="label">łącznie wydane</div>
        <div class="value">${total} zł</div>
        <div class="sub">rok 2026</div>
      </div>
      <div class="kpi">
        <div class="label">zakupów</div>
        <div class="value">${purchases.length}×</div>
        <div class="sub">1kg każdy</div>
      </div>
      <div class="kpi">
        <div class="label">średnia / zakup</div>
        <div class="value">${avg.toFixed(0)} zł</div>
        <div class="sub">min ${minP} — max ${maxP}</div>
      </div>
      <div class="kpi">
        <div class="label">średnia ocen</div>
        <div class="value">${avgRating.toFixed(1)}</div>
        <div class="sub">/ 10</div>
      </div>
      <div class="kpi accent">
        <div class="label">filiżanki</div>
        <div class="value">${cups}</div>
        <div class="sub">~${cupsPerKg} espresso / 1kg</div>
      </div>
      <div class="kpi">
        <div class="label">najdroższa</div>
        <div class="value">${priciest.price} zł</div>
        <div class="sub">${priciest.brand}</div>
      </div>
      ${best ? `
      <div class="kpi">
        <div class="label">najlepiej oceniona</div>
        <div class="value">${best.score.toFixed(1)}</div>
        <div class="sub">${best.brand}</div>
      </div>
      <div class="kpi">
        <div class="label">koszt / filiżanka</div>
        <div class="value">${(total / cups).toFixed(2)} zł</div>
        <div class="sub">średnio</div>
      </div>
      ` : ''}
    </div>
  `;
}

/* ---------- 9. ZAKŁADKA: RANKING ---------- */
function renderRanking() {
  const ranked = rankedPurchases();
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const medal = (i) => ['🥇','🥈','🥉'][i] || '';

  // zakupy bez ocen — można ocenić
  const unrated = state.data.purchases.filter(p => {
    const draw = state.data.rounds.flatMap(r => r.draws).find(d => d.id === p.drawId);
    const isMine = draw?.memberId === state.whoAmI;
    const alreadyRated = myRatingForPurchase(p.id);
    return !isMine && !alreadyRated;
  });

  // przycisk rejestracji: aktywny tylko dla wylosowanych w bieżącej rundzie bez zakupu
  const currentRound = state.data.rounds.find(r => r.number === state.data.currentRound);
  const myDrawInCurrentRound = currentRound?.draws.find(d => d.memberId === state.whoAmI);
  const canRegister = myDrawInCurrentRound && !purchaseForDraw(myDrawInCurrentRound.id);

  return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <h2>Ranking</h2>
      <button class="btn ${canRegister ? 'btn-primary' : 'btn-primary-disabled'}" id="btn-open-register"
        title="${canRegister ? '' : 'Rejestracja zakupu dostępna tylko dla wylosowanych uczestników w bieżącej rundzie'}">
        + zarejestruj zakup
      </button>
    </div>
    <div class="mono" style="margin-bottom:20px">
      kupiona po losowaniu · oceniana przez zespół (1-10) · zdjęcie opakowania obowiązkowe
    </div>

    ${unrated.length > 0 ? `
      <div class="card" style="margin-bottom:20px; border-left: 3px solid var(--coffee);">
        <h3 style="margin-bottom:12px">⭐ oceń kawę</h3>
        ${unrated.map(p => `
          <div class="history-row" style="margin-bottom:8px">
            <span class="what">${p.brand} · ${p.variety}</span>
            <button class="btn btn-primary" style="font-size:12px; padding:4px 10px" data-rate="${p.id}">
              oceń
            </button>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${ranked.length === 0 ? '<div class="mono" style="padding:40px;text-align:center;color:var(--ink-soft)">brak ocenionych zakupów</div>' : `
    <div class="ranking-top">
      ${top3.map((p, i) => {
        const draw = state.data.rounds.flatMap(r => r.draws).find(d => d.id === p.drawId);
        const buyer = memberById(draw.memberId);
        return `
          <div class="rank-card ${i === 0 ? 'top1' : ''}">
            <div class="photo">
              ${p.photo
                ? `<img src="${p.photo}" alt="kawa" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>`
                : `<span style="font-size:32px">${medal(i)}</span>`}
            </div>
            <div class="body">
              <div class="header">
                <span class="rank-num">#${i + 1}</span>
                <span class="score">${p.score.toFixed(1)}</span>
              </div>
              <div class="brand">${p.brand}</div>
              <div class="variety">${p.variety}</div>
              <div class="meta">${buyer.name} · ${p.price} zł · ${p.votes} ocen</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    ${rest.length ? `
      <div class="mono" style="margin-bottom:8px">pozostałe</div>
      <div class="rank-list">
        ${rest.map((p, idx) => {
          const draw = state.data.rounds.flatMap(r => r.draws).find(d => d.id === p.drawId);
          const buyer = memberById(draw.memberId);
          return `
            <div class="rank-row">
              <span class="num">#${idx + 4}</span>
              <div class="thumb">
                ${p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:4px"/>` : ''}
              </div>
              <div class="text">
                <div class="b">${p.brand} <span class="v">· ${p.variety}</span></div>
                <div class="v">${buyer.name} · ${p.price} zł · ${p.votes} ocen</div>
              </div>
              <span class="score" style="font-size:22px; font-weight:600">${p.score.toFixed(1)}</span>
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}
    `}
  `;
}

/* ---------- 10. MODALE ---------- */
function renderModal() {
  if (state.modal === 'purchase')   return renderModalPurchase();
  if (state.modal === 'rating')     return renderModalRating();
  if (state.modal === 'addMember')  return renderModalAddMember();
  return '';
}

function renderModalPurchase() {
  const drawId = state.modalData.drawId || '';
  return `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>📷 Zarejestruj zakup</h3>
          <button class="btn btn-ghost" id="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <label class="field-label">Palarnia / marka</label>
          <input class="field-input" id="f-brand" placeholder="np. HAYB, La Pajura..." />

          <label class="field-label">Odmiana</label>
          <input class="field-input" id="f-variety" placeholder="np. Etiopia Sidamo" />

          <label class="field-label">Cena (zł)</label>
          <input class="field-input" id="f-price" type="number" placeholder="np. 79" />

          <label class="field-label">Zdjęcie opakowania</label>
          <input class="field-input" id="f-photo" type="file" accept="image/*" />

          ${state.saving ? '<div class="mono" style="color:var(--coffee); margin-top:8px">zapisuję...</div>' : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="modal-close-2">Anuluj</button>
          <button class="btn btn-primary" id="btn-save-purchase" ${state.saving ? 'disabled' : ''}>
            Zapisz zakup
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderModalRating() {
  const purchase = state.data.purchases.find(p => p.id === state.modalData.purchaseId);
  const currentScore = state.modalData.score || 5;
  return `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>⭐ Oceń kawę</h3>
          <button class="btn btn-ghost" id="modal-close">✕</button>
        </div>
        <div class="modal-body" style="text-align:center">
          <div style="font-size:18px; font-weight:600; margin-bottom:4px">${purchase.brand}</div>
          <div class="mono" style="margin-bottom:24px">${purchase.variety}</div>

          <div class="score-picker">
            ${[1,2,3,4,5,6,7,8,9,10].map(n => `
              <button class="score-btn ${n === currentScore ? 'active' : ''}" data-score="${n}">${n}</button>
            `).join('')}
          </div>
          <div class="mono" style="margin-top:8px">wybrana ocena: <strong>${currentScore}</strong> / 10</div>
          ${state.saving ? '<div class="mono" style="color:var(--coffee); margin-top:8px">zapisuję...</div>' : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="modal-close-2">Anuluj</button>
          <button class="btn btn-primary" id="btn-save-rating" ${state.saving ? 'disabled' : ''}>
            Zapisz ocenę
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderModalAddMember() {
  return `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>👤 Dodaj uczestnika</h3>
          <button class="btn btn-ghost" id="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <label class="field-label">Imię</label>
          <input class="field-input" id="f-member-name" placeholder="np. Zosia" autocomplete="off" />

          <label class="field-label">Płeć</label>
          <div style="display:flex; gap:8px; margin-bottom:12px">
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer">
              <input type="radio" name="f-gender" value="K" checked /> Kobieta
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer">
              <input type="radio" name="f-gender" value="M" /> Mężczyzna
            </label>
          </div>

          <label class="field-label">Ulubiona kawa</label>
          <input class="field-input" id="f-member-drink" placeholder="np. flat white, espresso..." />

          ${state.saving ? '<div class="mono" style="color:var(--coffee); margin-top:8px">zapisuję...</div>' : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="modal-close-2">Anuluj</button>
          <button class="btn btn-primary" id="btn-save-member" ${state.saving ? 'disabled' : ''}>
            Dodaj do zespołu
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ---------- 11. EVENTY ---------- */
function attachEvents() {
  // wybór osoby (ekran startowy)
  document.querySelectorAll('[data-who]').forEach(el => {
    el.onclick = () => {
      state.whoAmI = el.dataset.who;
      localStorage.setItem('akcja-kawowa-who', state.whoAmI);
      render();
    };
  });

  // zmiana zakładki
  document.querySelectorAll('.tab').forEach(el => {
    el.onclick = () => { state.tab = el.dataset.tab; render(); };
  });

  // zmiana "kto teraz"
  const sel = $('#who-select');
  if (sel) sel.onchange = (e) => {
    state.whoAmI = e.target.value;
    localStorage.setItem('akcja-kawowa-who', state.whoAmI);
    render();
  };

  // przycisk LOSUJ
  const btnDraw = $('#btn-draw');
  if (btnDraw) btnDraw.onclick = startDraw;

  // powrót z wyniku
  const btnBack = $('#btn-back');
  if (btnBack) btnBack.onclick = () => {
    state.draw = { stage: 'idle', winner: null, gifUrl: null };
    render();
  };

  // zarejestruj zakup (z ekranu wyniku)
  const btnRegister = $('#btn-register');
  if (btnRegister) btnRegister.onclick = () => {
    const winnerDraw = state.data.rounds
      .flatMap(r => r.draws)
      .find(d => d.memberId === state.draw.winner);
    state.modal = 'purchase';
    state.modalData = { drawId: winnerDraw?.id };
    render();
  };

  // zarejestruj zakup (z rankingu)
  const btnOpenRegister = $('#btn-open-register');
  if (btnOpenRegister) btnOpenRegister.onclick = () => {
    const cr = state.data.rounds.find(r => r.number === state.data.currentRound);
    const myDraw = cr?.draws.find(d => d.memberId === state.whoAmI && !purchaseForDraw(d.id));
    if (!myDraw) return;
    state.modal = 'purchase';
    state.modalData = { drawId: myDraw.id };
    render();
  };

  // zamknij modal
  ['modal-close', 'modal-close-2', 'modal-overlay'].forEach(id => {
    const el = $(`#${id}`);
    if (el) el.onclick = (e) => {
      if (id !== 'modal-overlay' || e.target === el) {
        state.modal = null;
        state.modalData = {};
        render();
      }
    };
  });

  // zapisz zakup
  const btnSavePurchase = $('#btn-save-purchase');
  if (btnSavePurchase) btnSavePurchase.onclick = savePurchase;

  // przyciski oceny
  document.querySelectorAll('.score-btn').forEach(el => {
    el.onclick = () => {
      state.modalData.score = parseInt(el.dataset.score);
      render();
    };
  });

  // zapisz ocenę
  const btnSaveRating = $('#btn-save-rating');
  if (btnSaveRating) btnSaveRating.onclick = saveRating;

  // oceń kawę (przyciski w rankingu)
  document.querySelectorAll('[data-rate]').forEach(el => {
    el.onclick = () => {
      state.modal = 'rating';
      state.modalData = { purchaseId: el.dataset.rate, score: 7 };
      render();
    };
  });

  // przyciski obecności (W biurze / Nieobecny)
  document.querySelectorAll('[data-presence]').forEach(el => {
    el.onclick = () => {
      const isOff = el.dataset.off === 'true';
      togglePresence(el.dataset.presence, isOff);
    };
  });

  // dezaktywacja uczestnika
  document.querySelectorAll('[data-deactivate]').forEach(el => {
    el.onclick = () => deactivateMember(el.dataset.deactivate);
  });

  // dodaj uczestnika — otwórz modal
  const btnOpenAddMember = $('#btn-open-add-member');
  if (btnOpenAddMember) btnOpenAddMember.onclick = () => {
    state.modal = 'addMember';
    state.modalData = {};
    render();
  };

  // dodaj uczestnika — zapisz
  const btnSaveMember = $('#btn-save-member');
  if (btnSaveMember) btnSaveMember.onclick = saveNewMember;

  // nowa runda
  const btnNewRound = $('#btn-new-round');
  if (btnNewRound) btnNewRound.onclick = startNewRound;
}

/* ---------- 12. AKCJE ZAPISU ---------- */

async function startDraw() {
  const players = inGame();
  if (players.length === 0) return;

  const winner = players[Math.floor(Math.random() * players.length)];
  state.draw.winner = winner.id;
  state.draw.stage = 'reel';
  render();

  setTimeout(() => animateReel(winner), 50);

  // zapisz draw do Supabase
  try {
    const drawId = 'd' + uid();
    const today = new Date().toISOString().slice(0, 10);
    const savedDraw = await sb.post('draws', {
      id: drawId,
      round_number: state.data.currentRound,
      member_id: winner.id,
      draw_date: today,
    });
    // użyj ID z bazy (może się różnić od lokalnie wygenerowanego)
    const actualDrawId = (Array.isArray(savedDraw) ? savedDraw[0] : savedDraw)?.id ?? drawId;
    // dodaj lokalnie (bez reloadu, żeby nie przerywać animacji)
    let currentRoundObj = state.data.rounds.find(r => r.number === state.data.currentRound);
    if (!currentRoundObj) {
      currentRoundObj = { number: state.data.currentRound, draws: [] };
      state.data.rounds.unshift(currentRoundObj);
    }
    currentRoundObj.draws.unshift({ id: actualDrawId, memberId: winner.id, date: today });
    state.draw.savedDrawId = actualDrawId;
  } catch (err) {
    console.error('Błąd zapisu losowania:', err);
  }
}

async function savePurchase() {
  const brand   = $('#f-brand')?.value?.trim();
  const variety = $('#f-variety')?.value?.trim();
  const price   = parseInt($('#f-price')?.value);
  const fileInput = $('#f-photo');
  const file    = fileInput?.files?.[0];
  const drawId  = state.modalData.drawId;

  if (!brand || !variety || !price || !drawId) {
    alert('Uzupełnij markę, odmianę i cenę.');
    return;
  }

  state.saving = true;
  render();

  try {
    let photoUrl = null;

    if (file) {
      const ext = file.name.split('.').pop();
      const path = `${drawId}_${uid()}.${ext}`;
      photoUrl = await sb.uploadPhoto(file, path);
    }

    const purchaseId = 'p' + uid();
    await sb.post('purchases', {
      id: purchaseId,
      draw_id: drawId,
      brand,
      variety,
      price,
      photo_url: photoUrl,
    });

    // dodaj lokalnie
    state.data.purchases.push({ id: purchaseId, drawId, brand, variety, price, photo: photoUrl });

    state.modal = null;
    state.modalData = {};
    state.saving = false;
    state.draw = { stage: 'idle', winner: null, gifUrl: null };
    state.tab = 'ranking';
    render();
  } catch (err) {
    console.error('Błąd zapisu zakupu:', err);
    state.saving = false;
    alert('Błąd zapisu: ' + err.message);
    render();
  }
}

async function saveRating() {
  const purchaseId = state.modalData.purchaseId;
  const score      = state.modalData.score;

  if (!purchaseId || !score) return;

  state.saving = true;
  render();

  try {
    await sb.post('ratings', {
      purchase_id: purchaseId,
      member_id: state.whoAmI,
      score,
    });

    // dodaj lokalnie
    state.data.ratings.push({ purchaseId, memberId: state.whoAmI, score });

    state.modal = null;
    state.modalData = {};
    state.saving = false;
    render();
  } catch (err) {
    console.error('Błąd zapisu oceny:', err);
    state.saving = false;
    alert('Błąd zapisu: ' + err.message);
    render();
  }
}

async function saveNewMember() {
  const name   = $('#f-member-name')?.value?.trim();
  const drink  = $('#f-member-drink')?.value?.trim() || 'kawa';
  const gender = document.querySelector('input[name="f-gender"]:checked')?.value || 'K';

  if (!name) {
    alert('Wpisz imię uczestnika.');
    return;
  }

  const nameExists = state.data.team.some(p => p.name.toLowerCase() === name.toLowerCase());
  if (nameExists) {
    alert(`„${name}" już jest w zespole.`);
    return;
  }

  state.saving = true;
  render();

  try {
    const memberId = 'm' + uid();
    await sb.post('team', {
      id: memberId,
      name,
      drink,
      gender,
      active: true,
      today_off: false,
    });

    // dodaj lokalnie
    state.data.team.push({ id: memberId, name, drink, gender, active: true, today_off: false });
    state.data.team.sort((a, b) => a.name.localeCompare(b.name));

    state.modal = null;
    state.modalData = {};
    state.saving = false;
    render();
  } catch (err) {
    console.error('Błąd zapisu uczestnika:', err);
    state.saving = false;
    alert('Błąd zapisu: ' + err.message);
    render();
  }
}

async function deactivateMember(memberId) {
  const member = memberById(memberId);
  if (!member) return;
  if (!confirm(`Usunąć ${member.name} z zespołu? Osoba zniknie z losowania, ale historia pozostanie.`)) return;

  // optymistyczna aktualizacja
  member.active = false;
  render();

  try {
    await sb.patch('team', `id=eq.${memberId}`, { active: false });
  } catch (err) {
    console.error('Błąd dezaktywacji:', err);
    member.active = true;
    render();
    alert('Błąd: ' + err.message);
  }
}

async function startNewRound() {
  const newNumber = state.data.currentRound + 1;
  if (!confirm(`Rozpocząć rundę ${newNumber}? Wszyscy wracają do losowania.`)) return;

  try {
    await sb.patch('rounds', 'is_current=eq.true', { is_current: false });
    await sb.post('rounds', { number: newNumber, is_current: true });

    state.data.rounds.unshift({ number: newNumber, draws: [] });
    state.data.currentRound = newNumber;
    state.draw = { stage: 'idle', winner: null, gifUrl: null };
    render();
  } catch (err) {
    console.error('Błąd tworzenia nowej rundy:', err);
    alert('Błąd: ' + err.message);
  }
}

async function togglePresence(memberId, isOff) {
  const member = memberById(memberId);
  if (!member) return;

  // optymistyczna aktualizacja UI
  member.today_off = isOff;
  render();

  try {
    await sb.patch('team', `id=eq.${memberId}`, { today_off: isOff });
  } catch (err) {
    console.error('Błąd zapisu obecności:', err);
    // cofnij
    member.today_off = !isOff;
    render();
  }
}

/* ---------- 13. ANIMACJA LOSOWANIA ---------- */
function animateReel(winner) {
  const track = $('#reel-track');
  if (!track) return;

  const items = track.querySelectorAll('.reel-name');
  if (items.length === 0) return;

  const itemWidth = 60 + items[0].offsetWidth;
  const players = inGame();
  const winnerIdx = players.findIndex(p => p.id === winner.id);
  const targetIdx = players.length * 2 + winnerIdx;

  const reel = track.parentElement;
  const reelCenter = reel.offsetWidth / 2;
  const targetX = (targetIdx * itemWidth) + items[0].offsetWidth / 2 - reelCenter;

  let start = null;
  const duration = 3500;

  function tick(timestamp) {
    if (!start) start = timestamp;
    const elapsed = timestamp - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const x = -targetX * eased;
    track.style.transform = `translateX(${x}px)`;

    items.forEach((el, i) => {
      const elCenter = (i * itemWidth) + items[0].offsetWidth / 2 + x;
      const dist = Math.abs(elCenter - reelCenter);
      const closeness = Math.max(0, 1 - dist / 200);
      el.style.opacity = 0.3 + closeness * 0.7;
      el.style.transform = `scale(${1 + closeness * 0.4})`;
      el.style.color = closeness > 0.7 ? 'var(--coffee)' : 'var(--ink-2)';
    });

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      setTimeout(() => {
        state.draw.stage = 'wynik';
        render();
        loadGif();
        spawnConfetti();
      }, 400);
    }
  }
  requestAnimationFrame(tick);
}

/* ---------- 14. GIPHY ---------- */
async function loadGif() {
  const slot = $('#gif-slot');
  if (!slot) return;
  const KEY = 'dc6zaTOxFJmzC';
  const tags = ['coffee', 'celebration', 'drama', 'wow'];
  const tag = tags[Math.floor(Math.random() * tags.length)];
  try {
    const res = await fetch(`https://api.giphy.com/v1/gifs/random?api_key=${KEY}&tag=${tag}&rating=g`);
    const json = await res.json();
    const url = json.data?.images?.fixed_height?.url;
    if (url) slot.innerHTML = `<img src="${url}" alt="mem"/>`;
    else slot.innerHTML = '<span class="mono">brak gifa 😅</span>';
  } catch {
    slot.innerHTML = '<span class="mono">giphy offline</span>';
  }
}

/* ---------- 15. KONFETTI ---------- */
function spawnConfetti() {
  const stage = $('#result-stage');
  if (!stage) return;
  const colors = ['#8b5a2b','#c9a55b','#e9d8b8','#6b3e1a','#b54b3a'];
  for (let i = 0; i < 30; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + '%';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = Math.random() * 0.6 + 's';
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    stage.appendChild(c);
    setTimeout(() => c.remove(), 2200);
  }
}

/* ---------- 16. START ---------- */
(async function init() {
  try {
    await loadData();
    render();
  } catch (err) {
    $('#app').innerHTML = `
      <div style="padding:60px; text-align:center; color:var(--ink-soft)">
        <div class="mono">błąd ładowania danych</div>
        <div style="font-size:12px; margin-top:8px; color:var(--ink-soft)">${err.message}</div>
      </div>
    `;
  }
})();
