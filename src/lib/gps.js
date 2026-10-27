// GPS 기록 계산(웹·안드로이드 앱 공통). 화면·위치 입구와 상관없는 순수 계산만
// 점: { t(ms), lat, lng, alt(m, 없을 수 있음), acc(정확도 m) } / 기록: 구간 배열 [[점…], [점…]] (일시정지마다 새 구간)
// 확인: node src/lib/gps.check.js

const rad = d => d * Math.PI / 180;
export function dist(a, b) {   // 두 점 사이 m (하버사인)
  const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371e3 * Math.asin(Math.sqrt(x));
}

// 받을지 버릴지: 정확도 나쁜 점(>30m), 직전 점에서 순간이동한 점(시속 vmax 초과), 2m 미만 흔들림
export function accept(prev, p, vmaxKmh = 40) {
  if (p.acc > 30) return false;
  if (!prev) return true;
  const d = dist(prev, p), dt = (p.t - prev.t) / 1000;
  if (dt <= 0) return false;
  if (d / dt * 3.6 > vmaxKmh) return false;
  return d >= 2;
}

// 요약: 움직인 거리·시간(멈춰 있던 시간은 뺌), 1km 구간 기록, 상승고도
// 멈춤 = 두 점 사이 속도가 0.5m/s(시속 1.8km) 미만이거나 30초 넘게 점이 안 온 경우
export function summarize(segs) {
  let m = 0, sec = 0, gain = 0, anchor = null, splitAt = 0;
  const splits = [];
  for (const seg of segs) for (let i = 1; i < seg.length; i++) {
    const a = seg[i - 1], b = seg[i], d = dist(a, b), dt = (b.t - a.t) / 1000;
    if (dt <= 30 && d / dt >= 0.5) { m += d; sec += dt; }
    while (m >= (splits.length + 1) * 1000) { splits.push(sec - splitAt); splitAt = sec; }   // ponytail: 경계 넘은 구간을 통째로 앞 km 에 넣음(오차 몇 초)
    // 높이는 3m 넘게 바뀔 때만 셈(GPS 높이 흔들림 무시)
    if (b.alt != null) {
      if (anchor == null) anchor = b.alt;
      else if (b.alt > anchor + 3) { gain += b.alt - anchor; anchor = b.alt; }
      else if (b.alt < anchor - 3) anchor = b.alt;
    }
  }
  return { km: m / 1000, minutes: sec / 60, elev: gain, splits, paceSec: m ? sec / (m / 1000) : 0 };
}

// 프라이버시 구역: 출발·도착 지점 반경 r m 안의 점은 경로 그림에서 지움(집 위치 노출 방지)
export function trim(pts, r = 200) {
  if (pts.length < 2) return [];
  const s = pts[0], e = pts.at(-1);
  return pts.filter(p => dist(p, s) > r && dist(p, e) > r);
}

// 경로 선 그림(지도 없이). 위도에 따라 경도 간격을 줄여 모양이 찌그러지지 않게
export function routeSvg(pts, w = 320, h = 200, pad = 12) {
  if (pts.length < 2) return '';
  const k = Math.cos(rad(pts[0].lat)), xs = pts.map(p => p.lng * k), ys = pts.map(p => -p.lat);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min((w - pad * 2) / (x1 - x0 || 1e-9), (h - pad * 2) / (y1 - y0 || 1e-9));
  const ox = (w - (x1 - x0) * s) / 2, oy = (h - (y1 - y0) * s) / 2;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(ox + (xs[i] - x0) * s).toFixed(1)} ${(oy + (ys[i] - y0) * s).toFixed(1)}`).join('');
  return `<svg class="route" viewBox="0 0 ${w} ${h}" aria-label="운동 경로"><path d="${d}"/></svg>`;
}

// 시험용 가짜 경로: 중심에서 원을 그리며 달림(3초마다 한 점, 약간의 흔들림·튀는 점 포함)
export function fakeTrack(km = 5, paceSec = 330, start = Date.now()) {
  const c = { lat: 37.5283, lng: 126.9326 }, r = 400, n = Math.round(km * paceSec / 3), per = 2 * Math.PI * r;
  return Array.from({ length: n }, (_, i) => {
    const a = (i * 3 / paceSec * 1000) / per * 2 * Math.PI, jitter = (Math.sin(i * 7.3) * 2) / 111e3;
    const p = { t: start + i * 3000, lat: c.lat + r * Math.sin(a) / 111e3 + jitter, lng: c.lng + r * Math.cos(a) / (111e3 * Math.cos(rad(c.lat))), alt: 20 + 6 * Math.sin(a), acc: 8 };
    if (i % 97 === 50) p.lat += 0.01;   // 1km 넘게 튄 점
    return p;
  });
}
