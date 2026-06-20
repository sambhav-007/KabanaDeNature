'use strict';

const $ = (id) => document.getElementById(id);
let config = null;
let lastOccupancy = null;            // { units, adults, children5to12, childrenUnder5 }
let selection = null;                // { room, plan, checkIn, checkOut, occ }

// Blocking loading overlay (counter handles overlapping calls).
let _busy = 0;
function showLoading() { _busy++; const el = $('loadingOverlay'); if (el) el.hidden = false; }
function hideLoading() { _busy = Math.max(0, _busy - 1); const el = $('loadingOverlay'); if (el && _busy === 0) el.hidden = true; }
async function withLoading(promise) { showLoading(); try { return await promise; } finally { hideLoading(); } }

init();

function fillSelect(el, max, start) {
  el.innerHTML = '';
  for (let i = start; i <= max; i++) {
    el.innerHTML += `<option value="${i}">${i}</option>`;
  }
}

async function init() {
  config = await fetch('/api/config').then((r) => r.json());
  if (config.siteUrl) $('backLink').href = config.siteUrl;

  fillSelect($('units'), 9, 1);
  fillSelect($('adults'), 18, 1); $('adults').value = '2';
  fillSelect($('children5to12'), 10, 0);
  fillSelect($('childrenUnder5'), 10, 0);

  const ci = $('checkIn'), co = $('checkOut');
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  ci.min = today; ci.value = today;
  co.min = tomorrow; co.value = tomorrow;
  ci.addEventListener('change', () => {
    const next = new Date(new Date(ci.value).getTime() + 86400000).toISOString().slice(0, 10);
    co.min = next;
    if (co.value <= ci.value) co.value = next;
  });

  $('searchForm').addEventListener('submit', onSearch);
  $('guestClose').addEventListener('click', () => ($('guestModal').hidden = true));
  $('guestForm').addEventListener('submit', onPay);

  // Show rooms by default (1 room, 2 adults, today → tomorrow) without clicking.
  runSearch();
}

function readOcc() {
  return {
    units: parseInt($('units').value, 10),
    adults: parseInt($('adults').value, 10),
    children5to12: parseInt($('children5to12').value, 10),
    childrenUnder5: parseInt($('childrenUnder5').value, 10)
  };
}

async function onSearch(e) {
  e.preventDefault();
  runSearch();
}

async function runSearch() {
  const checkIn = $('checkIn').value, checkOut = $('checkOut').value;
  const occ = lastOccupancy = readOcc();
  const msg = $('searchMsg');
  msg.hidden = false; msg.className = 'bk-msg'; msg.textContent = 'Searching…';
  $('results').hidden = true;

  const qs = new URLSearchParams({ checkIn, checkOut, ...occ });
  try {
    const data = await withLoading(fetch('/api/availability?' + qs).then((r) => r.json()));
    if (data.error) throw new Error(data.error);
    renderResults(data, checkIn, checkOut, occ);
    msg.hidden = true;
  } catch (err) {
    msg.className = 'bk-msg error'; msg.textContent = err.message || 'Search failed';
  }
}

function renderResults(data, checkIn, checkOut, occ) {
  const wrap = $('results');
  wrap.innerHTML = '';
  const guestCount = occ.adults + occ.children5to12 + occ.childrenUnder5;

  data.rooms.forEach((room) => {
    const enough = room.available >= occ.units && room.fits;
    const card = document.createElement('article');
    card.className = 'bk-room' + (enough ? '' : ' bk-soldout');

    const specs = [
      room.size ? `${room.size} m²` : null,
      room.beds || null,
      `Max ${room.maxOccupancy} guest(s)`
    ].filter(Boolean).map((s) => `<span class="bk-spec">${s}</span>`).join('');
    const chips = (room.amenities || []).map((a) => `<span class="bk-chip">${a}</span>`).join('');

    let avail;
    if (!room.fits) avail = `Exceeds capacity — max ${room.maxOccupancy} guest(s) per room`;
    else if (room.available < occ.units) avail = room.available > 0
      ? `Only ${room.available} room(s) left` : 'Not available for these dates';
    else avail = `${room.available} room(s) left`;

    const plans = enough ? `
      <div class="bk-plans">
        ${room.plans.map((p, i) => `
          <label class="bk-plan">
            <input type="radio" name="plan-${room.id}" value="${p.code}" ${i === 0 ? 'checked' : ''} />
            <span class="bk-plan-info">
              <span class="bk-plan-name">${p.label}</span>
              <span class="bk-plan-code">${p.code}</span>
            </span>
            <span class="bk-plan-price">₹${p.totalDisplay}</span>
          </label>`).join('')}
      </div>` : '';

    card.innerHTML = `
      <img src="${room.image}" alt="${room.name}" loading="lazy" onerror="this.style.display='none'" />
      <div class="bk-room-body">
        <h3>${room.name}</h3>
        <div class="bk-specs">${specs}</div>
        <p>${room.description || ''}</p>
        ${chips ? `<div class="bk-chips">${chips}</div>` : ''}
        <div class="bk-avail ${enough ? '' : 'none'}">${avail}</div>
        ${plans}
        <div class="bk-room-meta">
          <span class="bk-price-note">${occ.units} room(s) · ${guestCount} guest(s) · total incl. meals</span>
          <button class="bk-btn bk-btn-primary" ${enough ? '' : 'disabled'}>Book</button>
        </div>
      </div>`;

    if (enough) {
      card.querySelector('button').addEventListener('click', () => {
        const chosen = card.querySelector(`input[name="plan-${room.id}"]:checked`).value;
        const plan = room.plans.find((p) => p.code === chosen);
        openGuest(room, plan, checkIn, checkOut, occ);
      });
    }
    wrap.appendChild(card);
  });
  wrap.hidden = false;
}

function openGuest(room, plan, checkIn, checkOut, occ) {
  selection = { room, plan, checkIn, checkOut, occ };
  const total = (plan.total / 100).toFixed(0);
  const guests = `${occ.adults} adult(s)` +
    (occ.children5to12 ? `, ${occ.children5to12} child(5–12)` : '') +
    (occ.childrenUnder5 ? `, ${occ.childrenUnder5} child(<5, free)` : '');
  $('guestTitle').textContent = `Book ${room.name}`;
  $('guestSummary').innerHTML =
    `${checkIn} → ${checkOut} · ${plan.nights} night(s)<br>` +
    `${occ.units} room(s) · ${guests}<br>` +
    `<strong>${plan.label} (${plan.code})</strong> · ₹${total} total`;
  $('payBtn').textContent = `Pay ₹${total} & confirm`;
  $('payNote').textContent = config.mockPayments
    ? 'Mock payment mode — no real charge. Confirms instantly.'
    : 'Secure payment via Razorpay (UPI / cards / netbanking).';
  $('guestModal').hidden = false;
}

async function onPay(e) {
  e.preventDefault();
  const btn = $('payBtn'); btn.disabled = true; const original = btn.textContent;
  btn.textContent = 'Processing…';
  const guest = { name: $('gName').value.trim(), phone: $('gPhone').value.trim(), email: $('gEmail').value.trim() };
  const { room, plan, checkIn, checkOut, occ } = selection;

  try {
    const res = await withLoading(fetch('/api/bookings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomTypeId: room.id, checkIn, checkOut, plan: plan.code,
        units: occ.units, adults: occ.adults,
        children5to12: occ.children5to12, childrenUnder5: occ.childrenUnder5,
        guest
      })
    }).then((r) => r.json()));
    if (res.error) throw new Error(res.error);

    if (res.mockPayments) {
      await verify(res.bookingId, { razorpay_order_id: res.order.id, razorpay_payment_id: 'mock', razorpay_signature: 'mock' });
    } else {
      await openRazorpay(res, guest);
    }
  } catch (err) {
    alert(err.message || 'Booking failed');
    btn.disabled = false; btn.textContent = original;
  }
}

function releaseHold(bookingId) {
  // Free the held room immediately if the guest backs out.
  return fetch(`/api/bookings/${bookingId}/release`, { method: 'POST' }).catch(() => {});
}

function openRazorpay(res, guest) {
  return new Promise((resolve) => {
    const resetBtn = () => { $('payBtn').disabled = false; $('payBtn').textContent = 'Pay & confirm'; };
    const rzp = new Razorpay({
      key: res.razorpayKeyId,
      order_id: res.order.id,
      amount: res.amount,
      currency: res.currency,
      name: 'Kabana de Nature',
      description: `${selection.room.name} · ${selection.plan.label} · ${selection.checkIn}→${selection.checkOut}`,
      prefill: { name: guest.name, contact: guest.phone, email: guest.email },
      theme: { color: '#ff3b30' },
      handler: async (resp) => { await verify(res.bookingId, resp); resolve(); },
      modal: {
        ondismiss: async () => { await releaseHold(res.bookingId); resetBtn(); resolve(); }
      }
    });
    // Payment failed inside Checkout → release the hold too.
    rzp.on('payment.failed', async () => { await releaseHold(res.bookingId); });
    rzp.open();
  });
}

async function verify(bookingId, resp) {
  const out = await withLoading(fetch('/api/payments/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...resp, bookingId })
  }).then((r) => r.json()));
  if (out.status === 'confirmed') {
    $('guestModal').hidden = true;
    $('successCode').textContent = out.code;
    $('successModal').hidden = false;
  } else {
    throw new Error(out.error || 'Could not confirm payment');
  }
}
