/* ==========================================================================
   트래블핀 — 앱 로직
   지역 데이터(mainPool / islandPool)는 data.js에서 불러온다.
   ========================================================================== */

/* ------------------------------------------------------------------ 상수 */

// 미니맵 SVG(200x300) 투영 설정.
// 경도 1도는 위도 1도보다 짧으므로 cos(중심 위도)로 보정해야 모양이 안 찌그러진다.
// pxPerLng 값은 울릉도(동경 130.9)까지 화면 안에 들어오는 배율로 잡았다.
const MAP = { centerLat: 35.9, centerLng: 128.1, cx: 100, cy: 150, pxPerLng: 27.9 };
MAP.pxPerLat = MAP.pxPerLng / Math.cos(MAP.centerLat * Math.PI / 180);

// 직선거리 → 실제 도로 거리 보정 계수, 평균 주행 속도(km/h)
const ROAD_FACTOR = 1.3;
const AVG_SPEED = 80;

/* ------------------------------------------------------------------ 유틸 */

// 두 좌표 사이 직선거리(km)
function haversine(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// 직선거리로 예상 운전 시간 추정
function driveTime(km) {
  const hours = (km * ROAD_FACTOR) / AVG_SPEED;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `차로 약 ${m}분`;
  if (m === 0) return `차로 약 ${h}시간`;
  return `차로 약 ${h}시간 ${m}분`;
}

// 위경도 → 미니맵 SVG 좌표. 실루엣과 핀이 이 함수를 같이 쓴다.
function toXY(p) {
  return {
    x: MAP.cx + (p.lng - MAP.centerLng) * MAP.pxPerLng,
    y: MAP.cy - (p.lat - MAP.centerLat) * MAP.pxPerLat
  };
}

// 입력한 지역명으로 출발지 찾기 (정확히 일치 → 부분 일치 순)
function findOrigin(text) {
  if (!text.trim()) return null;
  const t = text.trim();
  return mainPool.find(c => c.n === t)
      || mainPool.find(c => c.n.includes(t) || t.includes(c.n))
      || null;
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ------------------------------------------------------------------ 상태 */

let islandOn = false;   // 섬 추가 토글
let lastResult = null;  // { picked, origin }

/* ------------------------------------------------------------- 초기 렌더 */

document.getElementById('counterText').textContent =
  `전국 ${mainPool.length}개 시·군·구 중 한 곳`;

const originList = document.getElementById('originList');
mainPool.forEach(c => {
  const o = document.createElement('option');
  o.value = c.n;
  originList.appendChild(o);
});

// 대한민국 실루엣 — 뽑기 전 빈 화면에서도 이것만은 보인다
function drawSilhouette() {
  const d = mainlandOutline
    .map((p, i) => {
      const { x, y } = toXY(p);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ') + ' Z';
  document.getElementById('mainlandShape').setAttribute('d', d);

  const jeju = toXY(jejuShape);
  const jejuEl = document.getElementById('jejuShape');
  jejuEl.setAttribute('cx', jeju.x.toFixed(1));
  jejuEl.setAttribute('cy', jeju.y.toFixed(1));
  jejuEl.setAttribute('rx', (jejuShape.rLng * MAP.pxPerLng).toFixed(1));
  jejuEl.setAttribute('ry', (jejuShape.rLat * MAP.pxPerLat).toFixed(1));

  const ulleung = toXY(ulleungShape);
  const ulleungEl = document.getElementById('ulleungShape');
  ulleungEl.setAttribute('cx', ulleung.x.toFixed(1));
  ulleungEl.setAttribute('cy', ulleung.y.toFixed(1));
  ulleungEl.setAttribute('r', (ulleungShape.rLat * MAP.pxPerLat).toFixed(1));
}
drawSilhouette();

/* ----------------------------------------------------------- 컨트롤 바인딩 */

const rangeEl = document.getElementById('distRange');
const distVal = document.getElementById('distVal');
rangeEl.addEventListener('input', () => {
  distVal.textContent = rangeEl.value + 'km';
});

const toggle = document.getElementById('islandToggle');
const toggleText = document.getElementById('islandToggleText');

function flipIslandToggle() {
  islandOn = !islandOn;
  toggle.classList.toggle('on', islandOn);
  toggle.setAttribute('aria-checked', String(islandOn));
  toggleText.textContent = islandOn ? 'ON' : 'OFF';
}
toggle.addEventListener('click', flipIslandToggle);
toggle.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipIslandToggle(); }
});

/* --------------------------------------------------------------- 핀 던지기 */

function throwPin() {
  const origin = findOrigin(document.getElementById('originInput').value);
  const maxDist = parseInt(rangeEl.value, 10);

  // 출발지가 있으면 거리 안쪽만, 없으면 전국
  let pool = origin
    ? mainPool.filter(c => c.n !== origin.n && haversine(origin, c) <= maxDist)
    : mainPool;

  // 섬은 거리와 무관하게 추가
  if (islandOn) pool = pool.concat(islandPool);

  if (pool.length === 0) {
    showToast('조건에 맞는 여행지가 없어요. 거리를 늘려보세요.');
    return;
  }

  const picked = pool[Math.floor(Math.random() * pool.length)];
  lastResult = { picked, origin };
  renderResult(picked, origin);
}

function renderResult(picked, origin) {
  document.getElementById('stage').classList.remove('is-empty');
  document.getElementById('resultName').textContent = picked.n;

  const metaDistance = document.getElementById('metaDistance');
  const metaTime = document.getElementById('metaTime');

  if (origin) {
    const d = haversine(origin, picked);
    metaDistance.innerHTML = `<b>${origin.n}</b>에서 ${Math.round(d)}km`;
    metaTime.textContent = driveTime(d);
  } else {
    metaDistance.textContent = '전국 기준 무작위 선택';
    metaTime.textContent = '';
  }

  drawMap(picked, origin);
}

function drawMap(picked, origin) {
  const originDot = document.getElementById('originDot');
  const resultDot = document.getElementById('resultDot');
  const dashLine = document.getElementById('dashLine');

  const rp = toXY(picked);
  resultDot.setAttribute('cx', rp.x);
  resultDot.setAttribute('cy', rp.y);
  resultDot.setAttribute('opacity', 1);

  if (origin) {
    const op = toXY(origin);
    originDot.setAttribute('cx', op.x);
    originDot.setAttribute('cy', op.y);
    originDot.setAttribute('opacity', 1);
    dashLine.setAttribute('x1', op.x);
    dashLine.setAttribute('y1', op.y);
    dashLine.setAttribute('x2', rp.x);
    dashLine.setAttribute('y2', rp.y);
    dashLine.setAttribute('opacity', 1);
  } else {
    originDot.setAttribute('opacity', 0);
    dashLine.setAttribute('opacity', 0);
  }
}

/* ----------------------------------------------------------------- 액션 */

document.getElementById('throwBtn').addEventListener('click', throwPin);
document.getElementById('btnRetry').addEventListener('click', throwPin);

document.getElementById('originInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') throwPin();
});

// 네이버 지도 딥링크 (API 키 불필요)
document.getElementById('btnMap').addEventListener('click', () => {
  if (!lastResult) return;
  const q = encodeURIComponent(lastResult.picked.n);
  window.open(`https://map.naver.com/p/search/${q}`, '_blank');
});

// Web Share API, 미지원 브라우저는 클립보드 복사
document.getElementById('btnShare').addEventListener('click', async () => {
  if (!lastResult) return;
  const text = `트래블핀이 뽑아준 나의 다음 여행지는 ${lastResult.picked.n}! 🚗📍`;
  try {
    if (navigator.share) {
      await navigator.share({ text });
    } else {
      await navigator.clipboard.writeText(text);
      showToast('클립보드에 복사했어요');
    }
  } catch (e) {
    showToast('공유를 취소했어요');
  }
});
