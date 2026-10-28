// 기록하기 / 기록 수정 폼
import { S, sb, ok, $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { esc, fmtDurS, fmtClock, parseDur, toLocalInput, toast, fail, compress } from '../lib/util.js';
import { TYPE_GROUPS, TYPES, QUICK_DEFAULT, BRAGS } from '../lib/types.js';
import { agreeHealth } from './consent.js';
import { estKcal, latest, age } from '../lib/calc.js';
import { loadFeed, loadMine } from '../lib/data.js';
import { show } from '../nav.js';

const typeVal = () => $('#f-type').value;
const minutesVal = () => parseDur($('#f-dur').value);
// 수영은 m, 나머지는 km 가 기본 단위
const setUnit = u => { $('#f-unit').value = u; $('#f-dist').placeholder = u === 'm' ? '1500' : '5.00'; };

// 빠른 선택: 내가 많이 한 종목 6개 (기록이 적으면 기본 종목으로 채움)
function drawQuickTypes() {
  const n = {}; for (const w of S.mine) n[w.type] = (n[w.type] || 0) + 1;
  const top = [...new Set([...Object.keys(n).filter(k => TYPES[k]).sort((a, b) => n[b] - n[a]), ...QUICK_DEFAULT])].slice(0, 6);
  $('#quick-types').innerHTML = top.map(k => `<button type="button" class="chip" data-type="${k}" aria-pressed="${k === typeVal()}">${ic(TYPES[k].icon)}${TYPES[k].label}</button>`).join('');
}
function setType(k) {
  $('#f-type').value = k; setUnit(k === 'swim' ? 'm' : 'km'); followAuto();
  document.querySelectorAll('#quick-types [data-type]').forEach(b => b.setAttribute('aria-pressed', b.dataset.type === k));
  syncForm();
}

let formReady = false;
export function initForm() {
  initGearSelect();
  if (formReady) return; formReady = true;
  $('#f-type').innerHTML = Object.entries(TYPE_GROUPS).map(([g, list]) => `<optgroup label="${g}">${list.map(([k, label]) => `<option value="${k}">${label}</option>`).join('')}</optgroup>`).join('');
  $('#f-type').onchange = () => setType(typeVal());
  $('#quick-types').onclick = e => { const b = e.target.closest('[data-type]'); if (b) setType(b.dataset.type); };
  $('#brag-presets').innerHTML = BRAGS.map(s => `<button type="button" class="chip" data-brag="${esc(s)}">${esc(s)}</button>`).join('');
  $('#brag-presets').onclick = e => { const b = e.target.closest('[data-brag]'); if (b) $('#f-brag').value = b.dataset.brag; };
  $('#log-form').addEventListener('input', syncForm);
  $('#f-when').addEventListener('change', followAuto);
  $('#f-unit').onchange = () => setUnit($('#f-unit').value);
  $('#f-rpe').oninput = () => { $('#rpe-out').textContent = $('#f-rpe').value; };
  // 심박은 건강정보 → 동의 전엔 입력 못 함
  $('#f-hr').onfocus = async e => { if (S.consents.health) return; e.target.blur(); if (await agreeHealth()) $('#f-hr').focus(); };
  $('#f-photo').onchange = addPhotos;
  $('#thumbs').onclick = e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const [kind, i] = b.dataset.rm.split(':');
    if (kind === 'k') S.keptPhotos.splice(+i, 1); else URL.revokeObjectURL(S.newPhotos.splice(+i, 1)[0].url);
    drawThumbs();
  };
  // 새 기록: '기록 안 올리기'(입력한 것 지우고 피드로), 수정 중: '수정 취소'
  $('#f-cancel').onclick = () => { if (!S.editing && !confirm('이 기록을 올리지 않고 지울까요?')) return; resetForm(); show('feed'); };
  $('#log-form').onsubmit = saveWorkout;
  resetForm();
}
export function initGearSelect() {
  $('#f-gear').innerHTML = '<option value="">선택 안 함</option>' + S.gear.filter(g => !g.retired || g.id === S.editing?.gear_id).map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
  if (S.editing) $('#f-gear').value = S.editing.gear_id || '';
  $('#gear-field').hidden = !S.gear.length;
}
export function syncForm() {
  if (!formReady) return;
  $('#dist-row').hidden = !TYPES[typeVal()].dist;
  const m = minutesVal(), hr = +$('#f-hr').value || null, raw = $('#f-dur').value.trim();
  $('#dur-out').textContent = !raw ? '분:초 또는 시:분:초. "45"만 쓰면 45분' : m ? `= ${fmtDurS(m)}` : '29:44 처럼 입력해 주세요';
  $('#dur-out').classList.toggle('warn', !!raw && !m);
  $('#f-kcal').placeholder = m ? `자동 약 ${estKcal(typeVal(), m, hr)}` : '비우면 자동 계산';
  const w = latest('weight_kg'), a = age(), sex = S.body.p?.sex;
  $('#kcal-basis').textContent = !w ? '내 몸 탭에 체중을 넣으면 칼로리가 정확해져요 (지금은 70kg 기준)'
    : hr && a && sex ? `심박 공식으로 계산 중 · 체중 ${w}kg · ${a}세 · ${sex === 'male' ? '남' : '여'}`
    : `체중 ${w}kg 기준${a && sex ? ' · 평균 심박을 넣으면 더 정확해져요' : ' · 내 몸 탭에 나이·성별을 넣으면 더 정확해져요'}`;
}
function drawThumbs() {
  $('#thumbs').innerHTML = S.keptPhotos.map((p, i) => `<div><img alt="" src="${esc(S.urls[p] || '')}"><button type="button" data-rm="k:${i}" aria-label="사진 빼기">${ic('x')}</button></div>`).join('')
    + S.newPhotos.map((p, i) => `<div><img alt="" src="${p.url}"><button type="button" data-rm="n:${i}" aria-label="사진 빼기">${ic('x')}</button></div>`).join('');
}
async function addPhotos(e) {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of files) {
    if (S.keptPhotos.length + S.newPhotos.length >= 10) { toast('사진은 10장까지예요.'); break; }
    try { const blob = await compress(f); S.newPhotos.push({ blob, url: URL.createObjectURL(blob) }); }
    catch { toast(`${f.name}은(는) 열 수 없는 사진이에요.`); }
  }
  drawThumbs();
}
export function resetForm() {
  if (!formReady) return;
  S.editing = null; auto = null; $('#route-prev').innerHTML = '';
  $('#log-form').reset();
  S.newPhotos.forEach(p => URL.revokeObjectURL(p.url)); S.newPhotos = []; S.keptPhotos = [];
  $('#f-when').value = toLocalInput(Date.now()); $('#rpe-out').textContent = 5;
  drawQuickTypes(); setType($('#quick-types [data-type]').dataset.type);
  $('#log-heading').textContent = '운동 기록'; $('#f-submit').textContent = '올리고 약올리기'; $('#f-cancel').textContent = '기록 안 올리기';
  initGearSelect(); drawThumbs(); syncForm();
}
export function editWorkout(w) {
  resetForm(); S.editing = w;
  setType(TYPES[w.type] ? w.type : 'etc');
  $('#f-title').value = w.title || ''; $('#f-when').value = toLocalInput(w.started_at);
  $('#f-dur').value = fmtClock(w.duration_min);
  $('#f-dist').value = +w.distance_km ? (w.type === 'swim' ? Math.round(w.distance_km * 1000) : +w.distance_km) : ''; $('#f-elev').value = +w.elev_m || '';
  $('#f-kcal').value = Math.round(w.kcal) || ''; $('#f-hr').value = w.avg_hr || '';
  $('#f-rpe').value = w.rpe || 5; $('#rpe-out').textContent = w.rpe || 5;
  $('#f-brag').value = w.brag || ''; $('#f-memo').value = w.memo || ''; $('#f-note').value = S.notes[w.id] || '';
  $('#vis-' + w.visibility).checked = true; $('#f-commute').checked = w.tags?.includes('commute');
  for (const k of ['pace', 'hr', 'kcal']) $('#hide-' + k).checked = w.hide_stats?.includes(k);
  S.keptPhotos = [...w.photos];
  $('#log-heading').textContent = '기록 수정'; $('#f-submit').textContent = '수정 저장'; $('#f-cancel').textContent = '수정 취소';
  initGearSelect(); drawThumbs(); syncForm(); show('log');
}
async function saveWorkout(e) {
  e.preventDefault();
  const minutes = minutesVal();
  if (minutes <= 0) { $('#f-dur').focus(); return toast('운동 시간을 29:44 처럼 입력해 주세요.'); }
  if (minutes > 1440) return toast('운동 시간은 24시간 이하로 입력해 주세요.');
  const type = typeVal(), t = TYPES[type];
  const num = id => { const v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : 0; };
  const distance_km = t.dist ? num('#f-dist') / ($('#f-unit').value === 'm' ? 1000 : 1) : 0;
  if (t.vmax && distance_km / (minutes / 60) > t.vmax) return toast(`${t.label} 시속 ${Math.round(distance_km / (minutes / 60))}km? 차 타고 잰 거 아니죠? 거리나 시간을 확인해 주세요.`);
  const hr = Math.round(num('#f-hr')) || null;
  const row = {
    type, duration_min: minutes, distance_km,
    started_at: new Date($('#f-when').value || Date.now()).toISOString(),
    title: $('#f-title').value.trim() || null,
    elev_m: t.dist ? num('#f-elev') : 0,
    kcal: num('#f-kcal') || estKcal(type, minutes, hr),
    avg_hr: hr, rpe: +$('#f-rpe').value,
    gear_id: $('#f-gear').value || null,
    brag: $('#f-brag').value.trim() || null, memo: $('#f-memo').value.trim() || null,
    visibility: document.querySelector('input[name=vis]:checked').value,
    tags: $('#f-commute').checked ? ['commute'] : [],
    hide_stats: ['pace', 'hr', 'kcal'].filter(k => $('#hide-' + k).checked),
  };
  const note = $('#f-note').value.trim();
  $('#f-submit').disabled = true;
  try {
    const paths = [...S.keptPhotos];
    for (const p of S.newPhotos) {
      const path = `${S.uid}/${crypto.randomUUID()}.jpg`;
      ok(await sb.storage.from('photos').upload(path, p.blob, { contentType: 'image/jpeg' }));
      paths.push(path);
    }
    row.photos = paths;
    let saved;
    if (S.editing) {
      saved = ok(await sb.from('workouts').update(row).eq('id', S.editing.id).select().single());
      const removed = S.editing.photos.filter(p => !paths.includes(p));
      if (removed.length) await sb.storage.from('photos').remove(removed);
    } else saved = ok(await sb.from('workouts').insert(row).select().single());
    if (note) ok(await sb.from('private_notes').upsert({ workout_id: saved.id, note }));
    else if (S.notes[saved.id]) ok(await sb.from('private_notes').delete().eq('workout_id', saved.id));
    const wasEdit = !!S.editing;
    resetForm();
    await Promise.all([loadFeed(true), loadMine()]);
    show('feed');
    toast(wasEdit ? '수정했어요' : '올렸다! 이제 다들 약오를 차례 😝');
  } catch (err) { fail(err, '저장하지 못했어요. 다시 시도해 주세요.'); }
  finally { $('#f-submit').disabled = false; }
}
// 자동 제목: 시간대 + 종목 ("저녁 테니스"). 공유·워치·GPS 로 넘어온 기록에만 넣고, 종목·시간을 바꾸면 따라 바뀜(직접 고치면 멈춤)
export function autoTitle(type = typeVal(), when = $('#f-when').value || Date.now()) {
  const h = new Date(when).getHours();
  const part = h < 5 ? '새벽' : h < 11 ? '아침' : h < 14 ? '점심' : h < 18 ? '오후' : h < 22 ? '저녁' : '밤';
  return `${part} ${TYPES[type]?.label || '운동'}`;
}
let auto = null;   // 지금 제목 칸에 들어 있는 자동 제목
function followAuto() { if (auto !== null && $('#f-title').value === auto) $('#f-title').value = auto = autoTitle(); }

// 밖에서 넘어온 운동(공유 글·워치·GPS)을 새 기록 화면에 채움. 없는 값은 비워 둠
// d: { type, start(시각), minutes, km, elev, kcal, hr, memo, photos[blob] }
export async function fillAuto(d) {
  resetForm();
  if (d.type && TYPES[d.type]) setType(d.type);
  if (d.start) $('#f-when').value = toLocalInput(d.start);
  if (d.minutes) $('#f-dur').value = fmtClock(d.minutes);
  if (d.km) $('#f-dist').value = d.type === 'swim' ? Math.round(d.km * 1000) : +d.km.toFixed(2);
  if (d.elev) $('#f-elev').value = Math.round(d.elev);
  if (d.kcal) $('#f-kcal').value = Math.round(d.kcal);
  if (d.hr && S.consents.health) $('#f-hr').value = Math.round(d.hr);   // 심박은 건강정보 → 동의한 사람만
  if (d.memo) $('#f-memo').value = d.memo.slice(0, 1000);
  for (const b of d.photos || []) {
    if (S.newPhotos.length >= 10) break;
    try { const blob = await compress(b); S.newPhotos.push({ blob, url: URL.createObjectURL(blob) }); } catch { /* 사진이 아닌 파일 */ }
  }
  $('#f-title').value = auto = autoTitle();
  drawThumbs(); syncForm(); show('log');
}

// 공유 글에서 숫자 뽑기: "5.2km", "29:44", "350kcal", "142bpm", 종목 이름
export function parseShared(text) {
  const n = re => { const m = text.match(re); return m ? parseFloat(m[1].replace(',', '')) : null; };
  const dur = text.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/)?.[1];
  const type = Object.entries(TYPES).sort((a, b) => b[1].label.length - a[1].label.length).find(([, t]) => text.includes(t.label))?.[0]
    || (/러닝|런닝|조깅/.test(text) ? 'run' : /사이클|라이딩/.test(text) ? 'ride' : null);
  return { type, minutes: dur ? parseDur(dur) : null, km: n(/([\d.,]+)\s*km/i), kcal: n(/([\d,]+)\s*kcal/i) || n(/칼로리\D{0,6}([\d,]+)/), hr: n(/(\d{2,3})\s*bpm/i) || n(/심박\S*\s*(\d{2,3})/) };
}

// 다른 앱에서 공유받은 사진·글(sw.js 가 'share' 저장소에 둠) → 새 기록 화면에 담기
export async function takeShared() {
  if (!self.caches || !formReady) return;
  const c = await caches.open('share'), keys = await c.keys(); if (!keys.length) return;
  let text = ''; const photos = [];
  for (const k of keys) {
    const r = await c.match(k); await c.delete(k);
    if (k.url.endsWith('/text')) text = await r.text(); else photos.push(await r.blob());
  }
  await fillAuto({ ...parseShared(text), memo: text, photos });
  toast('공유한 내용을 담았어요. 종목과 시간을 확인해 주세요');
}
