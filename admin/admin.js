'use strict';

const $ = (id) => document.getElementById(id);
const api = (path, opts) => fetch('/api/admin' + path, {
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  ...opts
}).then((r) => r.json());

let rooms = [];

// Calendar selection state
const selection = new Set();   // keys: "roomId|date"
let dragging = false;
let dragSelecting = true;       // true = selecting, false = deselecting

boot();

async function boot() {
  const me = await api('/me');
  if (me.admin) showApp(); else showLogin();

  $('loginForm').addEventListener('submit', onLogin);
  $('logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }); location.reload(); });

  document.querySelectorAll('.ad-tabs button').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));

  $('refreshBookings').addEventListener('click', loadBookings);
  $('statusFilter').addEventListener('change', loadBookings);
  $('loadCal').addEventListener('click', loadCalendar);
  $('setRate').addEventListener('click', setRate);

  // Calendar bulk actions
  $('applyUnits').addEventListener('click', () => applyBulk({ setUnits: numOrNull($('bulkUnits').value) }));
  $('applyPrice').addEventListener('click', () => applyBulk({ setPrice: numOrNull($('bulkPrice').value) }));
  $('applyOpen').addEventListener('click', () => applyBulk({ blocked: false }));
  $('applyClose').addEventListener('click', () => applyBulk({ blocked: true }));
  $('resetCells').addEventListener('click', () => applyBulk({ setUnits: '', setPrice: '', blocked: false }));
  $('clearSel').addEventListener('click', clearSelection);
  document.addEventListener('mouseup', () => { dragging = false; });
}

function numOrNull(v) { return v === '' ? '' : v; }

function showLogin() { $('login').hidden = false; $('app').hidden = true; }
function showApp() {
  $('login').hidden = true; $('app').hidden = false;
  loadSummary(); loadRooms();
}

async function onLogin(e) {
  e.preventDefault();
  const out = await api('/login', {
    method: 'POST',
    body: JSON.stringify({ username: $('luser').value, password: $('lpass').value })
  });
  if (out.ok) showApp(); else $('loginErr').textContent = out.error || 'Login failed';
}

function switchTab(tab) {
  document.querySelectorAll('.ad-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.ad-tab').forEach((s) => s.hidden = s.id !== 'tab-' + tab);
  if (tab === 'bookings') loadBookings();
  if (tab === 'calendar') initCalDates();
  if (tab === 'dashboard') loadSummary();
}

async function loadSummary() {
  const s = await api('/summary');
  $('summary').innerHTML = [
    ['Arrivals today', s.arrivalsToday],
    ['Departures today', s.departuresToday],
    ['Pending holds', s.pending],
    ['Upcoming confirmed', s.confirmedUpcoming],
    ['Confirmed revenue', '₹' + (s.revenueConfirmed / 100).toFixed(0)]
  ].map(([label, val]) => `<div class="ad-stat"><b>${val}</b><span>${label}</span></div>`).join('');
}

async function loadBookings() {
  const status = $('statusFilter').value;
  const rows = await api('/bookings' + (status ? '?status=' + status : ''));
  const head = `<thead><tr>
    <th>Code</th><th>Guest</th><th>Room</th><th>Plan</th><th>Guests</th><th>Dates</th><th>Nights × Rooms</th>
    <th>Total</th><th>Status</th><th>Actions</th></tr></thead>`;
  const body = rows.map((b) => {
    const guests = `${b.adults}A` + (b.children ? ` ${b.children}C` : '') + (b.children_free ? ` ${b.children_free}i` : '');
    return `<tr>
    <td><b>${b.code}</b></td>
    <td>${esc(b.guest_name)}<br><small style="color:var(--muted)">${esc(b.guest_phone || b.guest_email || '')}</small></td>
    <td>${esc(b.room_name)}</td>
    <td><span class="badge plan">${b.plan}</span></td>
    <td>${guests}</td>
    <td>${b.check_in} → ${b.check_out}</td>
    <td>${b.nights} × ${b.units}</td>
    <td>₹${(b.total / 100).toFixed(0)}</td>
    <td><span class="badge ${b.status}">${b.status}</span></td>
    <td class="ad-act">
      ${b.status === 'confirmed' ? `<button data-act="checked_in" data-id="${b.id}">Check in</button>` : ''}
      ${b.status === 'checked_in' ? `<button data-act="checked_out" data-id="${b.id}">Check out</button>` : ''}
      ${['confirmed', 'pending', 'checked_in'].includes(b.status) ? `<button data-act="cancelled" data-id="${b.id}">Cancel</button>` : ''}
    </td></tr>`;
  }).join('');
  $('bookingsTable').innerHTML = head + '<tbody>' + (body || '<tr><td colspan="10" style="color:var(--muted)">No bookings.</td></tr>') + '</tbody>';
  $('bookingsTable').querySelectorAll('button[data-act]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await api(`/bookings/${btn.dataset.id}/status`, { method: 'POST', body: JSON.stringify({ status: btn.dataset.act }) });
      loadBookings(); loadSummary();
    }));
}

function initCalDates() {
  if ($('calFrom').value) return;
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  $('calFrom').value = from; $('calTo').value = to;
  loadCalendar();
}

function dow(date) { return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(date + 'T00:00:00Z').getUTCDay()]; }

async function loadCalendar() {
  const data = await api(`/calendar?from=${$('calFrom').value}&to=${$('calTo').value}`);
  if (data.error) return alert(data.error);

  const head = `<thead><tr><th>Room</th>${
    data.days.map((d) => `<th><span class="cal-dow">${dow(d)}</span>${d.slice(5)}</th>`).join('')
  }</tr></thead>`;

  const body = data.rooms.map((room) => `<tr>
    <td>${esc(room.name)}<br><small style="color:var(--muted)">${room.totalUnits} units</small></td>${
    room.days.map((d) => {
      const cls = d.blocked ? 'cell-blocked' : (d.available <= 0 ? 'cell-none' : (d.available <= 2 ? 'cell-low' : 'cell-ok'));
      const key = room.id + '|' + d.date;
      const sel = selection.has(key) ? ' selected' : '';
      const top = d.blocked ? 'Closed' : d.available;
      return `<td class="cal-cell ${cls}${sel}" data-room="${room.id}" data-date="${d.date}">
                <span class="cal-avail">${top}</span><small>₹${d.price}</small></td>`;
    }).join('')
  }</tr>`).join('');

  $('calTable').innerHTML = head + '<tbody>' + body + '</tbody>';
  wireCalendarSelection();
  updateBulkBar();
}

function wireCalendarSelection() {
  const table = $('calTable');
  table.querySelectorAll('.cal-cell').forEach((td) => {
    const key = td.dataset.room + '|' + td.dataset.date;
    td.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      dragSelecting = !selection.has(key);
      setSelected(td, key, dragSelecting);
    });
    td.addEventListener('mouseenter', () => {
      if (dragging) setSelected(td, key, dragSelecting);
    });
  });
}

function setSelected(td, key, on) {
  if (on) { selection.add(key); td.classList.add('selected'); }
  else { selection.delete(key); td.classList.remove('selected'); }
  updateBulkBar();
}

function clearSelection() {
  selection.clear();
  $('calTable').querySelectorAll('.cal-cell.selected').forEach((td) => td.classList.remove('selected'));
  updateBulkBar();
}

function updateBulkBar() {
  const n = selection.size;
  $('bulkBar').hidden = n === 0;
  $('selCount').textContent = `${n} date${n === 1 ? '' : 's'} selected`;
}

async function applyBulk(payload) {
  if (selection.size === 0) return;
  const cells = [...selection].map((k) => {
    const [roomTypeId, date] = k.split('|');
    return { roomTypeId: parseInt(roomTypeId, 10), date };
  });
  const out = await api('/calendar/bulk', { method: 'POST', body: JSON.stringify({ cells, ...payload }) });
  if (out.error) return alert(out.error);
  $('bulkUnits').value = ''; $('bulkPrice').value = '';
  await loadCalendar();   // re-render; selection persists via the Set
}

async function loadRooms() {
  rooms = await api('/rooms');
  $('roomsList').innerHTML = rooms.map((r) => `
    <div class="ad-room" data-id="${r.id}">
      <h4>${esc(r.name)}</h4>
      <div class="bk-field"><label>CPAI base ₹ / night (breakfast)</label><input type="number" class="r-price" value="${(r.base_price / 100).toFixed(0)}" /></div>
      <div class="ad-derived">MAPAI ₹${(r.base_price / 100 + 1000).toFixed(0)} · APAI ₹${(r.base_price / 100 + 2000).toFixed(0)}</div>
      <div class="bk-field"><label>Total units</label><input type="number" class="r-units" value="${r.total_units}" /></div>
      <button class="bk-btn bk-btn-primary r-save" style="width:100%">Save</button>
    </div>`).join('');
  $('roomsList').querySelectorAll('.ad-room').forEach((card) => {
    card.querySelector('.r-save').addEventListener('click', async () => {
      await api(`/rooms/${card.dataset.id}`, {
        method: 'POST',
        body: JSON.stringify({
          base_price: parseFloat(card.querySelector('.r-price').value),
          total_units: parseInt(card.querySelector('.r-units').value, 10)
        })
      });
      loadRooms();
    });
  });
  $('rateRoom').innerHTML = rooms.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
}

async function setRate() {
  await api('/rate', {
    method: 'POST',
    body: JSON.stringify({
      roomTypeId: parseInt($('rateRoom').value, 10),
      date: $('rateDate').value,
      price: $('ratePrice').value
    })
  });
  alert('Rate updated for ' + $('rateDate').value);
  $('ratePrice').value = '';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
