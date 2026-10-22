// 기록하기 / 기록 수정 폼
import { S, sb, ok, $ } from '../state.js';
import { ic } from '../lib/icons.js';
import { esc, fmtDurS, fmtClock, parseDur, toLocalInput, toast, fail } from '../lib/util.js';
import { TYPE_GROUPS, TYPES, QUICK_DEFAULT, BRAGS } from '../lib/types.js';
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
  $('#f-type').value = k; setUnit(k === 'swim' ? 'm' : 'km');
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
  $('#f-unit').onchange = () => setUnit($('#f-unit').value);
  $('#f-rpe').oninput = () => { $('#rpe-out').textContent = $('#f-rpe').value; };
  $('#f-photo').onchange = addPhotos;
  $('#thumbs').onclick = e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const [kind, i] = b.dataset.rm.split(':');
    if (kind === 'k') S.keptPhotos.splice(+i, 1); else URL.revokeObjectURL(S.newPhotos.splice(+i, 1)[0].url);
    drawThumbs();
  };
  $('#f-cancel').onclick = () => { resetForm(); show('feed'); };
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
// 다시 그려 저장하므로 사진 속 촬영 위치(EXIF GPS)도 함께 지워짐
async function compress(file) {
  const img = await createImageBitmap(file);
  const s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', .8));
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
  S.editing = null;
  $('#log-form').reset();
  S.newPhotos.forEach(p => URL.revokeObjectURL(p.url)); S.newPhotos = []; S.keptPhotos = [];
  $('#f-when').value = toLocalInput(Date.now()); $('#rpe-out').textContent = 5;
  drawQuickTypes(); setType($('#quick-types [data-type]').dataset.type);
  $('#log-heading').textContent = '운동 기록'; $('#f-submit').textContent = '올리고 약올리기'; $('#f-cancel').hidden = true;
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
  $('#log-heading').textContent = '기록 수정'; $('#f-submit').textContent = '수정 저장'; $('#f-cancel').hidden = false;
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
