'use strict';

/********************
 * 設定
 ********************/
const CONFIG = {
  title: '植物の応答とホルモン CBT（全50問）',
  timeLimitMinutes: 50,
  shuffleQuestions: true,
  shuffleOptions: false,
  allowReviewBeforeSubmit: true,
  showExplanationAfterSubmit: true, // ※本フラグは「不正解レビュー（問題のみ）」の表示可否として流用
  persistKey: 'cbt-plant-physiology-50-v1'
};

/********************
 * 問題データ（簡易スタブ：実利用時は自動生成または別JSで差し込む）
 * ここでは最初の2問だけスタブ化。実運用はサーバー側やビルド段階で全50問を注入してください。
 ********************/
const QUESTIONS = [
  {id:'q1', type:'single', stem:'刺激に対して方向性のある植物の運動を指す用語として最も適切なものはどれか。', options:['A. 傾性','B. 屈性','C. 膨圧運動','D. 成長運動'], correctIndex:1, tags:['屈性'], explanation:'刺激方向に依存して曲がる運動を屈性（tropism）という。'},
  {id:'q2', type:'single', stem:'刺激に対する方向性のない植物の運動として最も適切なものはどれか。', options:['A. 光屈性','B. 重力屈性','C. 屈性','D. 傾性'], correctIndex:3, tags:['傾性'], explanation:'刺激方向に依存しない応答は傾性（ナスティ）。'}
  // ...（省略：ここに残り48問を同形式で追加してください）
];

/********************
 * ユーティリティ
 ********************/
const $ = sel => document.querySelector(sel);
function shuffle(arr){ return arr.map(v=>[Math.random(),v]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]); }
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}

/********************
 * 状態
 ********************/
let state = { order: [], answers: {}, current: 0, startedAt: null, endsAt: null, submitted: false, score: 0, tagStats: {} };

/********************
 * 初期化
 ********************/
function init(){
  document.title = CONFIG.title + ' - CBT 一問一答';
  // Backspaceで戻る無効（入力欄では可）
  window.addEventListener('keydown', (e)=>{
    if(e.key === 'Backspace'){
      const t = e.target; const editable = t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable);
      if(!editable){ e.preventDefault(); }
    }
  }, {capture:true});

  const saved = load(); if(saved){ state = {...state, ...saved}; }
  if(!state.order.length){ const ids = QUESTIONS.map(q=>q.id); state.order = CONFIG.shuffleQuestions ? shuffle(ids) : ids; }
  if(CONFIG.timeLimitMinutes>0 && !state.endsAt){ const now = Date.now(); state.startedAt = now; state.endsAt = now + CONFIG.timeLimitMinutes*60*1000; }
  render(); setupKeys(); tick();
}
document.addEventListener('DOMContentLoaded', init);

/********************
 * 保存/読込
 ********************/
function save(){ try{ localStorage.setItem(CONFIG.persistKey, JSON.stringify(state)); }catch(e){} }
function load(){ try{ const raw = localStorage.getItem(CONFIG.persistKey); if(!raw) return null; const obj = JSON.parse(raw); if(!obj || !Array.isArray(obj.order)) return null; return obj; }catch(e){ return null; } }
function resetAll(){ localStorage.removeItem(CONFIG.persistKey); location.reload(); }

/********************
 * レンダリング
 ********************/
function render(){
  const total = state.order.length; const idx = clamp(state.current,0,total-1); state.current = idx;
  const q = getQuestionByOrder(idx);

  $('#meta').textContent = `${CONFIG.title} — 問題 ${idx+1} / ${total}`;
  $('#progress').style.width = `${((idx)/Math.max(1,total-1))*100}%`;

  const screen = $('#screen'); screen.textContent = '';

  if(state.submitted){ screen.appendChild(renderResult()); return; }

  const card = document.createElement('div'); card.className = 'question-card';

  const fs = document.createElement('fieldset'); fs.setAttribute('role','group');
  const lg = document.createElement('legend'); lg.textContent = q.stem; fs.appendChild(lg);

  const optsWrap = document.createElement('div'); optsWrap.className = 'opts';
  (q.options||[]).forEach((text,i)=>{
    const id = `opt-${q.id}-${i}`;
    const label = document.createElement('label'); label.className='opt'; label.setAttribute('for',id);
    const input = document.createElement('input'); input.type='radio'; input.name=`q-${q.id}`; input.id=id; input.value=i;
    const saved = state.answers[q.id]; if(saved && saved.type==='single' && saved.choiceIndex===i){ input.checked = true; }
    input.addEventListener('change',()=>{ state.answers[q.id] = {type:'single', choiceIndex:Number(input.value)}; save(); });
    const txt = document.createElement('span'); txt.textContent = text;
    label.appendChild(input); label.appendChild(txt); optsWrap.appendChild(label);
  });
  fs.appendChild(optsWrap);

  card.appendChild(fs);

  const nav = document.createElement('div'); nav.className='nav';
  const back = document.createElement('button'); back.textContent='← 戻る'; back.className='secondary'; back.disabled = state.current===0 || !CONFIG.allowReviewBeforeSubmit;
  back.addEventListener('click',()=>{ state.current = Math.max(0, state.current-1); save(); render(); });
  const next = document.createElement('button'); next.textContent = (state.current===total-1) ? '解答を送信' : '次へ →';
  next.addEventListener('click',()=>{ if(state.current===total-1){ submitAnswers(); } else { state.current = Math.min(total-1, state.current+1); save(); render(); } });
  nav.appendChild(back); nav.appendChild(next); card.appendChild(nav);

  screen.appendChild(card);
}

function renderResult(){
  const wrap = document.createElement('div'); wrap.className='result';
  const h = document.createElement('h2'); h.textContent='結果'; wrap.appendChild(h);

  const stats = document.createElement('div'); stats.className = 'grid';
  const total = state.order.length; const percent = Math.round((state.score/total)*100);
  stats.appendChild(stat('得点', `${state.score} / ${total}（${percent}%）`));
  if(CONFIG.timeLimitMinutes>0){ const remained = Math.max(0, state.endsAt - Date.now()); const used = CONFIG.timeLimitMinutes*60*1000 - remained; stats.appendChild(stat('経過時間', fmtTime(used))); }

  const tagBox = document.createElement('div'); tagBox.className='stat';
  const tagTitle = document.createElement('div'); tagTitle.style.fontWeight='700'; tagTitle.textContent='分野別正答'; tagBox.appendChild(tagTitle);
  const ul = document.createElement('ul'); ul.className='muted';
  Object.entries(state.tagStats).forEach(([tag, {count, correct}])=>{
    const li = document.createElement('li'); const pct = Math.round((correct/count)*100);
    li.textContent = `${tag}: ${correct}/${count}（${pct}%）`; ul.appendChild(li);
  });
  tagBox.appendChild(ul); stats.appendChild(tagBox); wrap.appendChild(stats);

  // === ここが要求仕様：不正解のみ、問題文だけ表示 ===
  if(CONFIG.showExplanationAfterSubmit){
    const review = document.createElement('div'); review.className='panel';
    const title = document.createElement('div'); title.style.fontWeight='700'; title.style.marginBottom='8px';
    title.textContent = '不正解レビュー（問題のみ表示）'; review.appendChild(title);
    let anyShown = false;
    state.order.forEach((qid, idx)=>{
      const q = QUESTIONS.find(x=>x.id===qid);
      const your = state.answers[qid];
      const correct = isCorrect(q, your);
      if(correct) return;
      const block = document.createElement('div'); block.className='explain wrong';
      const stem = document.createElement('div'); stem.innerHTML = `<strong>Q${idx+1}.</strong> ${escapeHtml(q.stem)}`;
      block.appendChild(stem);
      review.appendChild(block);
      anyShown = true;
    });
    if(!anyShown){
      const none = document.createElement('div'); none.className='muted'; none.textContent='不正解の問題はありません。';
      review.appendChild(none);
    }
    wrap.appendChild(review);
  }

  const actions = document.createElement('div'); actions.className='nav';
  const retry = document.createElement('button'); retry.textContent='もう一度やる'; retry.addEventListener('click', ()=> resetAll());
  const exportBtn = document.createElement('button'); exportBtn.className='secondary'; exportBtn.textContent='結果をJSONで保存';
  exportBtn.addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify({score: state.score, answers: state.answers, tagStats: state.tagStats}, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'result.json'; a.click(); URL.revokeObjectURL(url);
  });
  actions.appendChild(retry); actions.appendChild(exportBtn); wrap.appendChild(actions);

  return wrap;
}

function stat(label, value){ const d=document.createElement('div'); d.className='stat'; d.innerHTML = `<div class="muted">${label}</div><div style="font-size:20px;font-weight:700">${value}</div>`; return d; }

/********************
 * 採点
 ********************/
function submitAnswers(){
  let score = 0; const tagStats = {};
  state.order.forEach(qid=>{
    const q = QUESTIONS.find(x=>x.id===qid);
    const a = state.answers[qid];
    const ok = isCorrect(q,a);
    if(ok) score++;
    (q.tags||['(未分類)']).forEach(tag=>{
      if(!tagStats[tag]) tagStats[tag] = {count:0, correct:0};
      tagStats[tag].count += 1;
      tagStats[tag].correct += ok ? 1 : 0;
    });
  });
  state.score = score; state.tagStats = tagStats; state.submitted = true; save(); render();
}

function isCorrect(q, a){
  if(!a) return false;
  if(q.type==='single'){ return a.choiceIndex === q.correctIndex; }
  return false;
}

/********************
 * タイマーと入力
 ********************/
function fmtTime(ms){ const t=Math.max(0,Math.floor(ms/1000)); const m=Math.floor(t/60).toString().padStart(2,'0'); const s=(t%60).toString().padStart(2,'0'); return `${m}:${s}`; }
function tick(){ if(CONFIG.timeLimitMinutes>0 && state.endsAt){ const remain=state.endsAt - Date.now(); $('#timer').textContent = fmtTime(remain); if(remain<=0 && !state.submitted){ submitAnswers(); } } else { $('#timer').textContent='--:--'; } requestAnimationFrame(()=>setTimeout(tick,250)); }
function setupKeys(){ window.addEventListener('keydown',(e)=>{ if(state.submitted) return; const q=getQuestionByOrder(state.current); if(e.key>='1'&&e.key<='9'&&q.type==='single'){ const idx=Number(e.key)-1; const radios=document.querySelectorAll(`input[name="q-${q.id}"]`); if(radios[idx]){ radios[idx].checked=true; radios[idx].dispatchEvent(new Event('change')); } } if(e.key==='Enter'){ const total=state.order.length; if(state.current===total-1){ submitAnswers(); } else { state.current=Math.min(total-1,state.current+1); save(); render(); } } }); }

/********************
 * 補助
 ********************/
function getQuestionByOrder(i){ const qid = state.order[i]; return QUESTIONS.find(q=>q.id===qid); }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
