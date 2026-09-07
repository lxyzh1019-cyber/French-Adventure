import { firebaseReady } from './state/firebase-bootstrap.js';
import { CURRICULUM, SENTENCES } from './content/curriculum-map.js';





// ════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════
function defaultParentSettings(){
  return { weekdayOpen:[true,true,true,true,true,true,true] }; // Sun–Sat, false = locked (test day)
}
const DEFAULT_STATE = () => ({
  totalStars:0, weekStars:0, streak:0, lastPlayed:null,
  weekStart:getWeekStart(), topicStars:{}, dailyRounds:{},
  moons:{grade4:false,grade5:false,grade6:false,grade7:false,grade8:false,grade9:false,grade10:false,super:false},
  failedWords:{}, playedDays:{}, todayStats:{},
  dailyTimeMs:{}, lastDrillComplete:null,
  parentSettings:defaultParentSettings(),
  gradeUnlocked:defaultGradeUnlocked(), gradeStats:{}, gradeGameRounds:{}, dailyTopicStats:{},
  gradeParentOpen:{4:true,5:false,6:false,7:false,8:false,9:false,10:false},
  tier1Conquered:false, tier2Conquered:false, tier3Conquered:false,
  tier1ParentOpen:false, tier2ParentOpen:false, tier3ParentOpen:false,
  seedProfilePatches:{},
  lastUpdatedAt:0
});

let state = {jenn:DEFAULT_STATE(), jess:DEFAULT_STATE()};
let currentPlayer = null;
let currentGrade = 4;
let currentGameType = null;

// Round state
let questions=[], qIndex=0, roundScore=0, roundBasePoints=0, roundSpeedPoints=0, lives=3, currentQ=null;
let roundTopicTally={};
let builtWords=[], scrambleAnswer=[], scrambleSource=[];
let matchSelected=null, matchPairs=[], matchMatched=[], matchFrOrder=[], matchEnOrder=[];
let __roundDraftSnap=null;
let questionStartTime=0;
const SPEED_BONUS_WINDOW=8000, SPEED_BONUS_MAX=10, DAILY_ROUND_LIMIT=2;
const DAILY_PLAY_CAP_MS = 30 * 60 * 1000; // child-facing cap; full time with parent unlock
/** Grades unlock progressively from G4 up to G10. */
const MAX_PLAYABLE_GRADE = 10;
const ALL_GAME_TYPES = ['quiz','match','scramble','builder','listen','boss'];

let summaryMode = 'weekly';
let dailySummaryOffset = 0;
let pendingPlayer = null;
let sessionWeekdayBypass = false;
let sessionFullTimeReveal = false;
let recoveryWriteFreeze = false;
let listenersInitialized = false;
let playTimeInterval = null;
let lastPlayTimeMark = 0;

const LOCAL_STATE_PREFIX = 'french_game_local_';
const ROUND_DRAFT_PREFIX = 'french_round_draft_';
const syncMeta = {
  jenn: { pendingCloud: false, lastLocalSave: 0, lastCloudOk: 0, suppressSnapshotUntil: 0 },
  jess: { pendingCloud: false, lastLocalSave: 0, lastCloudOk: 0, suppressSnapshotUntil: 0 }
};
let roundDraftTimer = null;
let lastWrongPenaltyAt = 0;

function persistLocalStateMirror(player){
  try{
    const raw = JSON.stringify(state[player]);
    localStorage.setItem(LOCAL_STATE_PREFIX + player, raw);
    syncMeta[player].lastLocalSave = Date.now();
  }catch(e){ console.warn('local mirror err', e); }
}
function loadLocalStateMirror(player){
  try{
    const raw = localStorage.getItem(LOCAL_STATE_PREFIX + player);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}
function hydrateStateFromLocalMirror(){
  ['jenn','jess'].forEach(function(pl){
    const loc = loadLocalStateMirror(pl);
    if(!loc) return;
    const lr = Number(loc.lastUpdatedAt||0);
    const cr = Number(state[pl].lastUpdatedAt||0);
    if(lr > cr){
      state[pl] = Object.assign({}, DEFAULT_STATE(), loc);
      syncMeta[pl].pendingCloud = true;
    }
  });
  ['jenn','jess'].forEach(function(pl){
    tryUnlockGradesAndTiers(state[pl]);
    if(applySeedProfilePatchesIfNeeded(pl, 'afterUnlock')) void saveState(pl, {patchOnly: true});
  });
}
function clearAllRoundDraftsForPlayer(player){
  try{
    const prefix = ROUND_DRAFT_PREFIX + player + '_';
    const rm = [];
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(prefix)) rm.push(k);
    }
    rm.forEach(k=>localStorage.removeItem(k));
  }catch(e){ console.warn('clear drafts err', e); }
}
function roundDraftStorageKey(player, dayKey, gameType, grade){
  return ROUND_DRAFT_PREFIX + player + '_' + dayKey + '_' + gameType + '_g' + grade;
}
function serializeMatchSelected(){
  if(!matchSelected) return null;
  return { side: matchSelected.side, word: matchSelected.word };
}
function collectRoundDraft(){
  if(!currentPlayer || !currentGameType) return null;
  const tk = todayKey();
  const feedbackOpen = document.getElementById('feedback-overlay') && document.getElementById('feedback-overlay').classList.contains('show');
  let listenInput = '';
  try{
    const inp = document.getElementById('listen-input');
    if(inp) listenInput = inp.value || '';
  }catch(_){}
  return {
    v: 1,
    savedAt: Date.now(),
    tk, player: currentPlayer, grade: currentGrade, type: currentGameType,
    qIndex, questions, lives, roundScore, roundBasePoints, roundSpeedPoints, roundTopicTally,
    currentQ, questionStartTime, feedbackOpen,
    matchPairs, matchMatched, matchFrOrder, matchEnOrder,
    matchSelected: serializeMatchSelected(),
    scrambleAnswer, scrambleSource: scrambleSource ? [...scrambleSource] : [],
    builtWords: builtWords ? [...builtWords] : [],
    listenInput
  };
}
function persistRoundDraftNow(){
  if(!currentPlayer || !currentGameType || recoveryWriteFreeze) return;
  try{
    const d = collectRoundDraft();
    if(!d || !d.questions || !d.questions.length) return;
    const key = roundDraftStorageKey(d.player, d.tk, d.type, d.grade);
    localStorage.setItem(key, JSON.stringify(d));
  }catch(e){ console.warn('round draft save err', e); }
}
function scheduleRoundDraftPersist(){
  if(roundDraftTimer) clearTimeout(roundDraftTimer);
  roundDraftTimer = setTimeout(function(){
    roundDraftTimer = null;
    persistRoundDraftNow();
  }, 400);
}
function clearCurrentRoundDraft(){
  if(!currentPlayer || !currentGameType) return;
  try{
    localStorage.removeItem(roundDraftStorageKey(currentPlayer, todayKey(), currentGameType, currentGrade));
  }catch(_){}
}
function loadRoundDraftForStart(type){
  if(!currentPlayer) return null;
  try{
    const key = roundDraftStorageKey(currentPlayer, todayKey(), type, currentGrade);
    const raw = localStorage.getItem(key);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}
function restoreRoundDraft(d){
  questions = d.questions || [];
  qIndex = Math.min(Math.max(0, d.qIndex|0), Math.max(0, questions.length - 1));
  lives = d.lives != null ? d.lives : 3;
  roundScore = d.roundScore|0;
  roundBasePoints = d.roundBasePoints|0;
  roundSpeedPoints = d.roundSpeedPoints|0;
  roundTopicTally = d.roundTopicTally && typeof d.roundTopicTally === 'object' ? d.roundTopicTally : {};
  currentQ = questions[qIndex] || null;
  questionStartTime = d.questionStartTime || Date.now();
  matchPairs = d.matchPairs || [];
  matchMatched = d.matchMatched || [];
  matchFrOrder = d.matchFrOrder || [];
  matchEnOrder = d.matchEnOrder || [];
  if(d.matchSelected && d.matchSelected.side && d.matchSelected.word){
    matchSelected = { btn: null, side: d.matchSelected.side, word: d.matchSelected.word };
  }else{
    matchSelected = null;
  }
  scrambleAnswer = d.scrambleAnswer || [];
  scrambleSource = d.scrambleSource ? [...d.scrambleSource] : [];
  builtWords = d.builtWords ? [...d.builtWords] : [];
  if(d.feedbackOpen){
    try{ document.getElementById('feedback-overlay').classList.remove('show'); }catch(_){}
  }
  renderLives();
  renderScore();
  document.getElementById('progress-bar').style.width = (questions.length ? (qIndex / questions.length * 100) : 0) + '%';
  __roundDraftSnap = d;
  renderQuestion();
  __roundDraftSnap = null;
  if(currentQ && currentQ.type === 'listen' && d.listenInput){
    setTimeout(function(){
      const inp = document.getElementById('listen-input');
      if(inp) inp.value = d.listenInput;
    }, 0);
  }
}
function applyWrongAttemptPenalty(koDelayMs){
  const now = Date.now();
  if(now - lastWrongPenaltyAt < 250) return lives <= 0;
  lastWrongPenaltyAt = now;
  lives = Math.max(0, (lives|0) - 1);
  renderLives();
  const knockedOut = lives <= 0;
  if(knockedOut){
    setTimeout(endRound, koDelayMs||1500);
  }
  return knockedOut;
}
function updateConnectionStatusUI(){
  const online = typeof navigator !== 'undefined' && navigator.onLine;
  const netTxt = online ? 'Online' : 'Offline';
  const hubs = [['conn-net-hub','conn-sync-hub','conn-dot-hub'], ['conn-net-game','conn-sync-game','conn-dot-game']];
  const p = currentPlayer;
  let syncTxt = '—';
  if(p && syncMeta[p]){
    const m = syncMeta[p];
    if(!online){
      syncTxt = m.lastLocalSave ? 'Saved on this iPad · cloud when online' : 'Not saved yet';
    }else if(m.pendingCloud){
      syncTxt = 'Waiting to sync to cloud…';
    }else{
      syncTxt = m.lastCloudOk ? 'Synced to cloud' : 'Ready';
    }
  }else{
    syncTxt = online ? 'Pick a player' : 'Offline';
  }
  hubs.forEach(function(row){
    const netEl = document.getElementById(row[0]);
    const syEl = document.getElementById(row[1]);
    const dot = document.getElementById(row[2]);
    if(netEl) netEl.textContent = netTxt;
    if(syEl) syEl.textContent = syncTxt;
    if(dot){
      dot.classList.toggle('cs-online', online);
      dot.classList.toggle('cs-offline', !online);
    }
  });
}
async function flushPendingCloudSaves(){
  for(const pl of ['jenn','jess']){
    if(syncMeta[pl] && syncMeta[pl].pendingCloud){
      await saveState(pl);
    }
  }
}
function initConnectivityAndSyncUI(){
  updateConnectionStatusUI();
  window.addEventListener('online', function(){
    updateConnectionStatusUI();
    flushPendingCloudSaves();
  });
  window.addEventListener('offline', updateConnectionStatusUI);
}

// Session clock
// countdown vars declared in session clock section below

// Speech
let speechSynth=window.speechSynthesis;
let recognition=null;
if('SpeechRecognition' in window||'webkitSpeechRecognition' in window){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  recognition=new SR();
  recognition.lang='fr-FR';
  recognition.continuous=false;
  recognition.interimResults=false;
}

// ════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════
// Monday-anchored week start — local timezone (not UTC)
function getWeekStart(){
  const d=new Date();
  d.setHours(0,0,0,0);
  const day=d.getDay(); // 0=Sun,1=Mon,...6=Sat
  d.setDate(d.getDate()-(day===0?6:day-1)); // roll back to Monday
  // Return local date string to avoid UTC shift
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function isSameWeek(ts){
  if(!ts) return true; // null/missing = treat as current week, never auto-wipe
  return ts >= getWeekStart();
}
// Single shared week-rollover — called by both applyPlayerData and endRound
// to prevent double-archiving if both run at the exact week boundary.
function applyWeekRolloverIfNeeded(s){
  if(isSameWeek(s.weekStart)) return;
  if(!s.weeklyHistory) s.weeklyHistory=[];
  const newWs=getWeekStart();
  if(s.weekStart){
    const rollup=rollupWeekStatsForRange(s,s.weekStart,newWs);
    if(s.weekStars>0||rollup.rounds>0||rollup.stars>0||rollup.correct>0||rollup.wrong>0){
      s.weeklyHistory.push({
        weekStart:s.weekStart,
        stars:s.weekStars,
        correct:rollup.correct,
        wrong:rollup.wrong,
        rounds:rollup.rounds,
        snapshotStars:rollup.stars,
        savedAt:todayKey()
      });
      if(s.weeklyHistory.length>4)s.weeklyHistory.shift();
    }
  }
  s.weekStars=0;
  s.weekStart=newWs;
}
function todayKey(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function dateKeyAddDays(delta){
  const d=new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate()+delta);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function getParentSettings(){
  const ps=state.jenn?.parentSettings||state.jess?.parentSettings;
  return Object.assign(defaultParentSettings(), ps||{});
}
function rollupWeekStatsForRange(s, weekStartStr, beforeDateStr){
  let correct=0,wrong=0,rounds=0,stars=0;
  if(!s.todayStats)return{correct,wrong,rounds,stars};
  Object.entries(s.todayStats).forEach(([dk,ts])=>{
    if(dk>=weekStartStr && dk<beforeDateStr){
      correct+=ts.correct||0; wrong+=ts.wrong||0;
      rounds+=ts.rounds||0; stars+=ts.stars||0;
    }
  });
  return{correct,wrong,rounds,stars};
}
function formatPlayTime(ms, useCap){
  const x=(useCap&&!sessionFullTimeReveal)?Math.min(ms,DAILY_PLAY_CAP_MS):ms;
  const m=Math.floor(x/60000), s=Math.floor((x%60000)/1000);
  return m+':'+(s<10?'0':'')+s;
}
function mulberry32(a){
  return function(){
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffleSeeded(arr, seed){
  const clone = [...arr];
  const rnd = mulberry32(seed >>> 0);
  for(let i = clone.length - 1; i > 0; i--){
    const j = Math.floor(rnd() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}
function dailyShuffleSeed(){
  return parseInt(todayKey().replace(/-/g, ''), 10) >>> 0;
}
/** Alberta-style growth: G4 = 110 words; G5+ adds 120, 130, 140… new words per year */
function newWordsIntroducedAtGrade(g){
  if(g === 4) return 110;
  if(g >= 5) return 110 + 10 * (g - 4);
  return 0;
}
function cumulativeVocabTarget(grade){
  const cap = Math.min(Math.max(grade, 4), 12);
  let total = 0;
  for(let g = 4; g <= cap; g++) total += newWordsIntroducedAtGrade(g);
  return total;
}
function sentenceTargetCount(grade){ return 18 + (grade - 4) * 2; }
function expandVocabToTarget(baseList, target, seed){
  if(!baseList.length) return [];
  if(baseList.length >= target) return shuffleSeeded(baseList, seed).slice(0, target);
  const sh = shuffleSeeded(baseList, seed);
  const out = [];
  for(let i = 0; i < target; i++) out.push({ ...sh[i % sh.length] });
  return out;
}
function mergeCarryoverVocab(grade, pool, seed){
  if(grade <= 4) return pool;
  const prev = getAllVocabCumulative(grade - 1);
  if(!prev.length) return pool;
  const take = Math.max(1, Math.floor(pool.length * 0.25));
  const extra = shuffleSeeded(prev, seed + 777).slice(0, take);
  return [...extra, ...pool];
}
function gradeFocusedVocabPool(grade, target, seed){
  const gVocab = getAllVocab(grade);
  if(!gVocab.length) return expandVocabToTarget(getAllVocabCumulative(grade), target, seed);
  const gradeShare = Math.max(6, Math.floor(target * 0.7));
  const fromGrade = expandVocabToTarget(gVocab, gradeShare, seed + 17);
  let fromPrev = [];
  if(grade > 4){
    const prev = getAllVocabCumulative(grade - 1);
    const need = Math.max(0, target - fromGrade.length);
    if(prev.length && need > 0) fromPrev = expandVocabToTarget(prev, need, seed + 29);
  }
  return shuffleSeeded([...fromGrade, ...fromPrev], seed + 41);
}
function accuracyToTopicStars(acc){
  if(acc >= 0.95) return 3;
  if(acc >= 0.80) return 2;
  if(acc >= 0.60) return 1;
  return 0;
}
function gradeTier(grade){
  if(grade <= 5) return 1;
  if(grade <= 7) return 2;
  if(grade <= 9) return 3;
  return 4;
}
function defaultGradeUnlocked(){
  const o = {};
  for(let g = 4; g <= 10; g++) o[g] = (g === 4);
  return o;
}
function defaultGradeParentOpen(){
  const o = {};
  for(let g = 4; g <= 10; g++) o[g] = false;
  o[4] = true;
  return o;
}
function clampGradeUnlocks(o){
  if(!o) return;
  for(let g = MAX_PLAYABLE_GRADE + 1; g <= 10; g++) o[g] = false;
}
function highestUnlockedGrade(s){
  if(!s || !s.gradeUnlocked) return 4;
  let top = 4;
  for(let g = 4; g <= MAX_PLAYABLE_GRADE; g++){
    if(s.gradeUnlocked[g]) top = g;
  }
  return top;
}
function isAutoOpenGrade(s, grade){
  return grade >= (highestUnlockedGrade(s) - 1);
}
function ensureGradeParentOpenState(s){
  if(!s.gradeParentOpen) s.gradeParentOpen = defaultGradeParentOpen();
  for(let g = 4; g <= 10; g++){
    if(s.gradeParentOpen[g] === undefined) s.gradeParentOpen[g] = false;
  }
}
function closeGradesBelowWindow(s, topGrade){
  ensureGradeParentOpenState(s);
  for(let g = 4; g <= 10; g++){
    if(g <= topGrade - 2) s.gradeParentOpen[g] = false;
  }
}
function hasFullMoonForGrade(s, grade){
  const topics = getTopics(grade);
  if(!topics.length) return false;
  return topics.every(([k]) => (s.topicStars[`${grade}_${k}`] || 0) >= 3);
}
function gradeDayAccuracy(s, dateKey, grade){
  const gs = s.gradeStats && s.gradeStats[dateKey] && s.gradeStats[dateKey][grade];
  if(!gs) return null;
  const t = (gs.correct || 0) + (gs.wrong || 0);
  if(t < 5) return null;
  return (gs.correct || 0) / t;
}
function markGradeRoundComplete(s, dateKey, grade, gameType){
  if(!s.gradeGameRounds) s.gradeGameRounds = {};
  if(!s.gradeGameRounds[dateKey]) s.gradeGameRounds[dateKey] = {};
  if(!s.gradeGameRounds[dateKey][grade]) s.gradeGameRounds[dateKey][grade] = {};
  s.gradeGameRounds[dateKey][grade][gameType] = (s.gradeGameRounds[dateKey][grade][gameType] || 0) + 1;
}
function mergeRoundTopicIntoDaily(s, dateKey, topicKey, gameType, c, w){
  if(!s.dailyTopicStats) s.dailyTopicStats = {};
  if(!s.dailyTopicStats[dateKey]) s.dailyTopicStats[dateKey] = {};
  if(!s.dailyTopicStats[dateKey][topicKey]) s.dailyTopicStats[dateKey][topicKey] = {};
  if(!s.dailyTopicStats[dateKey][topicKey][gameType]) s.dailyTopicStats[dateKey][topicKey][gameType] = { c:0, w:0 };
  s.dailyTopicStats[dateKey][topicKey][gameType].c += c || 0;
  s.dailyTopicStats[dateKey][topicKey][gameType].w += w || 0;
}
function computeTopicStarFromDaily(s, dateKey, topicKey){
  const byType = s.dailyTopicStats && s.dailyTopicStats[dateKey] && s.dailyTopicStats[dateKey][topicKey];
  if(!byType) return 0;
  let c = 0, w = 0, gameTypeCount = 0;
  Object.values(byType).forEach(o=>{
    const t = (o.c||0) + (o.w||0);
    if(t > 0) gameTypeCount++;
    c += o.c || 0;
    w += o.w || 0;
  });
  const total = c + w;
  if(gameTypeCount < 3 || total < 6) return 0;
  return accuracyToTopicStars(c / total);
}
function topicStarProgressParts(s, dateKey, topicKey){
  const byType = s.dailyTopicStats && s.dailyTopicStats[dateKey] && s.dailyTopicStats[dateKey][topicKey];
  let c = 0, w = 0, gameTypeCount = 0;
  if(byType){
    Object.values(byType).forEach(o=>{
      const t = (o.c||0) + (o.w||0);
      if(t > 0) gameTypeCount++;
      c += o.c || 0;
      w += o.w || 0;
    });
  }
  const total = c + w;
  const acc = total > 0 ? c / total : 0;
  const gamesNeed = Math.max(0, 3 - gameTypeCount);
  const triesNeed = Math.max(0, 6 - total);
  const gateReady = gameTypeCount >= 3 && total >= 6;
  const accPct = Math.round(acc * 100);
  const currentTier = gateReady ? accuracyToTopicStars(acc) : 0;
  let nextThreshold = null;
  if(gateReady){
    if(acc < 0.6) nextThreshold = 60;
    else if(acc < 0.8) nextThreshold = 80;
    else if(acc < 0.95) nextThreshold = 95;
  }
  let nextTargetLine = 'Keep going!';
  if(gamesNeed > 0){
    nextTargetLine = `Play ${gamesNeed} more game type${gamesNeed===1?'':'s'}`;
  }else if(triesNeed > 0){
    nextTargetLine = `Do ${triesNeed} more trie${triesNeed===1?'':'s'}`;
  }else if(nextThreshold !== null){
    nextTargetLine = `Reach ${nextThreshold}% for next star`;
  }else if(gateReady){
    nextTargetLine = 'Top star reached for today';
  }
  let tierProgress = 0;
  if(gateReady){
    if(acc < 0.6){
      tierProgress = Math.max(0, Math.min(1, acc / 0.6));
    }else if(acc < 0.8){
      tierProgress = Math.max(0, Math.min(1, (acc - 0.6) / 0.2));
    }else if(acc < 0.95){
      tierProgress = Math.max(0, Math.min(1, (acc - 0.8) / 0.15));
    }else{
      tierProgress = 1;
    }
  }
  return {
    gameTypeCount, total, acc, accPct, currentTier, gateReady,
    gamesNeed, triesNeed, nextThreshold, nextTargetLine, tierProgress
  };
}
function topicStarProgressHTML(s, dateKey, topicKey, earnedStars){
  if(earnedStars >= 3) return '';
  const p = topicStarProgressParts(s, dateKey, topicKey);
  const meterPct = Math.round((p.tierProgress || 0) * 100);
  const showMeter = p.gateReady && p.nextThreshold !== null;
  const gamesLine = `${p.gameTypeCount}/3`;
  const triesLine = `${p.total}/6`;
  const accLine = p.total >= 6 ? `${p.accPct}%` : 'Starts after 6 tries';
  const meter = showMeter
    ? `<div class="sm-star-meter"><div class="sm-star-meter-fill" style="width:${meterPct}%"></div></div><div class="sm-star-meter-label">Toward next star: ${meterPct}%</div>`
    : '';
  return `<div class="sm-star-progress"><div>Games: ${gamesLine}</div><div>Tries: ${triesLine}</div><div>Accuracy: ${accLine}</div><div>Next: ${p.nextTargetLine}</div>${meter}</div>`;
}
function applySeedProfilePatchesIfNeeded(p, phase){
  const s = state[p];
  if(!s || phase !== 'afterUnlock') return false;
  if(!s.seedProfilePatches) s.seedProfilePatches = {};
  const tk = todayKey();
  let changed = false;
  if(!s.seedProfilePatches.clearG56TopicStarsV2){
    Object.keys(s.topicStars || {}).forEach(k=>{
      if(k.startsWith('5_') || k.startsWith('6_')) delete s.topicStars[k];
    });
    if(s.dailyTopicStats && s.dailyTopicStats[tk]){
      Object.keys(s.dailyTopicStats[tk]).forEach(k=>{
        if(k.startsWith('5_') || k.startsWith('6_')) delete s.dailyTopicStats[tk][k];
      });
    }
    syncMoonsToTopicStars(s);
    s.seedProfilePatches.clearG56TopicStarsV2 = true;
    changed = true;
  }
  if(p === 'jenn' && !s.seedProfilePatches.jennG7CloseG5Open){
    s.gradeUnlocked[7] = false;
    ensureGradeParentOpenState(s);
    s.gradeParentOpen[5] = true;
    s.gradeParentOpen[6] = true;
    s.gradeParentOpen[7] = false;
    closeGradesBelowWindow(s, highestUnlockedGrade(s));
    s.seedProfilePatches.jennG7CloseG5Open = true;
    changed = true;
  }
  return changed;
}
function dayQualifiesForGate(s, dateKey, grade){
  const rounds = s.gradeGameRounds && s.gradeGameRounds[dateKey] && s.gradeGameRounds[dateKey][grade];
  if(!rounds) return false;
  if(!ALL_GAME_TYPES.every(type => (rounds[type] || 0) >= 1)) return false;
  const acc = gradeDayAccuracy(s, dateKey, grade);
  return acc !== null && acc >= 0.95;
}
function consecutiveQualifyingDays(s, grade){
  let streak = 0;
  for(let d = 0; d < 14; d++){
    const dk = dateKeyAddDays(-d);
    if(dayQualifiesForGate(s, dk, grade)) streak++;
    else break;
  }
  return streak;
}
function gateProgressLabel(s, grade){
  return Math.min(consecutiveQualifyingDays(s, grade), 2) + '/2';
}
function latestGateGrade(s){
  if(!s || !s.gradeUnlocked) return 4;
  for(let g = 4; g < 10; g++){
    if(!s.gradeUnlocked[g + 1]) return g;
  }
  return 10;
}
function isGradePlayable(s, grade){
  if(grade > MAX_PLAYABLE_GRADE) return false;
  if(!s.gradeUnlocked || !s.gradeUnlocked[grade]) return false;
  ensureGradeParentOpenState(s);
  return isAutoOpenGrade(s, grade) || !!s.gradeParentOpen[grade];
}
function tryUnlockGradesAndTiers(s){
  const unlocked = [];
  clampGradeUnlocks(s.gradeUnlocked);
  ensureGradeParentOpenState(s);
  for(let g = 5; g <= MAX_PLAYABLE_GRADE; g++){
    if(s.gradeUnlocked[g]) continue;
    const prev = g - 1;
    if(!s.gradeUnlocked[prev]) continue;
    if(!hasFullMoonForGrade(s, prev)) continue;
    if(consecutiveQualifyingDays(s, prev) < 2) continue;
    s.gradeUnlocked[g] = true;
    closeGradesBelowWindow(s, g);
    unlocked.push(g);
  }
  return unlocked;
}
function bumpGradeStats(s, grade, correct, wrong){
  const tk = todayKey();
  if(!s.gradeStats) s.gradeStats = {};
  if(!s.gradeStats[tk]) s.gradeStats[tk] = {};
  if(!s.gradeStats[tk][grade]) s.gradeStats[tk][grade] = { correct: 0, wrong: 0 };
  s.gradeStats[tk][grade].correct += correct;
  s.gradeStats[tk][grade].wrong += wrong;
}
function tallyTopicFromWord(word, correct){
  if(!word || !word.topic) return;
  const g = word.grade || currentGrade;
  const tk = `${g}_${word.topic}`;
  if(!roundTopicTally[tk]) roundTopicTally[tk] = { c: 0, w: 0 };
  if(correct) roundTopicTally[tk].c++;
  else roundTopicTally[tk].w++;
}
function recordGradeAttempt(grade, ok){
  if(!currentPlayer) return;
  bumpGradeStats(state[currentPlayer], grade, ok ? 1 : 0, ok ? 0 : 1);
}
function shuffle(arr){return [...arr].sort(()=>Math.random()-.5);}
function rand(arr){return arr[Math.floor(Math.random()*arr.length)];}
function getTopics(grade){return Object.entries(CURRICULUM[grade]||{});}
function getAllVocab(grade){return getTopics(grade).flatMap(([k,v])=>v.vocab.map(w=>({...w,topic:k,grade})));}
function getAllVocabCumulative(grade){
  const cap = Math.min(Math.max(grade, 4), MAX_PLAYABLE_GRADE);
  const seen = new Set();
  const out = [];
  for(let g = 4; g <= cap; g++){
    getAllVocab(g).forEach(w=>{
      if(seen.has(w.fr)) return;
      seen.add(w.fr);
      out.push(w);
    });
  }
  return out;
}
function findVocabWord(fr, scopeGrade){
  const g = scopeGrade == null ? currentGrade : scopeGrade;
  return getAllVocabCumulative(g).find(v=>v.fr===fr);
}
function getSentences(grade){return SENTENCES[grade]||SENTENCES[4];}
function getSentencesExpanded(grade, seedExtra){
  const sents = getSentences(grade);
  const target = sentenceTargetCount(grade);
  const seed = dailyShuffleSeed() + grade * 499 + (seedExtra || 0);
  if(sents.length >= target) return shuffleSeeded(sents, seed).slice(0, target);
  const sh = shuffleSeeded(sents, seed);
  const out = [];
  for(let i = 0; i < target; i++) out.push({ ...sh[i % sh.length], parts: [...sh[i % sh.length].parts] });
  return out;
}
function kidTopicCue(word){
  const g = word.grade || currentGrade;
  const t = (CURRICULUM[g] && word.topic) ? CURRICULUM[g][word.topic] : null;
  return t ? (t.icon + ' ' + t.name) : 'Listen carefully 🔊';
}

function showToast(msg,color=null){
  const t=document.getElementById('toast');
  t.textContent=msg;t.style.borderColor=color||'var(--green)';t.style.color=color||'var(--green)';
  t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);
}
function confetti(){
  const colors=['#e8445a','#3b82f6','#f59e0b','#10b981','#a78bfa','#f472b6'];
  for(let i=0;i<55;i++){
    const el=document.createElement('div');el.className='confetti-piece';
    el.style.left=Math.random()*100+'vw';el.style.background=colors[Math.floor(Math.random()*colors.length)];
    el.style.animationDuration=(1.5+Math.random()*2)+'s';el.style.animationDelay=(Math.random()*.8)+'s';
    document.body.appendChild(el);setTimeout(()=>el.remove(),3500);
  }
}
function closeOverlay(id){document.getElementById(id).classList.remove('show');}

// ════════════════════════════════════════════════
// SESSION CLOCK (item #9)
// ════════════════════════════════════════════════
const SESSION_LIMIT_MS = 20 * 60 * 1000; // 20 minutes
let countdownInterval = null;
let countdownEnd = 0;

function startSessionClock(){
  countdownEnd = Date.now() + SESSION_LIMIT_MS;
  if(countdownInterval) clearInterval(countdownInterval);

  function tickCountdown(){
    const remaining = countdownEnd - Date.now();
    const cd = document.getElementById('countdown-display');
    const wallEl = document.getElementById('clock-wall');

    // Wall clock
    const now = new Date();
    let h = now.getHours(), m = now.getMinutes();
    const ampm = h>=12?'PM':'AM'; h = h%12||12;
    if(wallEl) wallEl.textContent = h+':'+(m<10?'0':'')+m+' '+ampm;

    if(remaining <= 0){
      clearInterval(countdownInterval);
      if(cd){ cd.textContent='⏳ 0:00'; cd.classList.add('warning'); }
      lockApp();
      return;
    }
    const mins = Math.floor(remaining/60000);
    const secs = Math.floor((remaining%60000)/1000);
    const label = '⏳ '+mins+':'+(secs<10?'0':'')+secs;
    if(cd){
      cd.textContent = label;
      cd.classList.toggle('warning', remaining < 3*60*1000); // warn at 3 min
    }
    updateFrenchGameTimeDisplay();
  }
  tickCountdown();
  countdownInterval = setInterval(tickCountdown, 1000);
}

function updateFrenchGameTimeDisplay(){
  if(!currentPlayer) return;
  const s = state[currentPlayer];
  const tk = todayKey();
  const rawMs = (s.dailyTimeMs && s.dailyTimeMs[tk]) || 0;
  const pt = document.getElementById('hub-playtime-val');
  if(!pt) return;
  pt.textContent = formatPlayTime(rawMs, true) + (sessionFullTimeReveal || rawMs <= DAILY_PLAY_CAP_MS ? '' : '+');
}

function lockApp(){
  document.getElementById('lock-overlay').classList.add('show');
  if(countdownInterval){ clearInterval(countdownInterval); countdownInterval=null; }
}

function unlockApp(){
  const input = document.getElementById('lock-pwd');
  const err = document.getElementById('lock-error');
  if((input?.value||'') !== PARENT_PASSWORD){
    err.textContent = '❌ Wrong password';
    setTimeout(()=>{ err.textContent=''; }, 2000);
    return;
  }
  input.value = '';
  err.textContent = '';
  document.getElementById('lock-overlay').classList.remove('show');
  // Reset countdown for another 20 minutes
  startSessionClock();
}

function isWeekdayPlayAllowed(){
  if(sessionWeekdayBypass)return true;
  const ps=getParentSettings();
  return ps.weekdayOpen[new Date().getDay()]!==false;
}
function startPlayTimeTracker(){
  stopPlayTimeTracker();
  lastPlayTimeMark=Date.now();
  playTimeInterval=setInterval(()=>flushPlayTimeTick(true),10000);
}
function stopPlayTimeTracker(){
  if(playTimeInterval){clearInterval(playTimeInterval);playTimeInterval=null;}
  flushPlayTimeTick(true);
}
function flushPlayTimeTick(doSave){
  if(!currentPlayer)return;
  const sel=document.getElementById('screen-select');
  if(sel&&sel.style.display==='block'){
    lastPlayTimeMark=Date.now();
    return;
  }
  if(document.hidden)return;
  const now=Date.now();
  let delta=now-lastPlayTimeMark;
  lastPlayTimeMark=now;
  if(delta<400)return;
  if(delta>90000)delta=60000;
  const s=state[currentPlayer];
  if(!s.dailyTimeMs)s.dailyTimeMs={};
  const k=todayKey();
  s.dailyTimeMs[k]=(s.dailyTimeMs[k]||0)+delta;
  updateFrenchGameTimeDisplay();
  if(doSave)saveState(currentPlayer);
}
// ════════════════════════════════════════════════
// FIREBASE — baseline load + real-time sync
// ════════════════════════════════════════════════
async function applyPlayerData(p, data){
  // Suppress our own echo: if we just saved, skip the next snapshot for 6s
  if(syncMeta[p] && Date.now() < syncMeta[p].suppressSnapshotUntil){
    return;
  }
  const localSnap = loadLocalStateMirror(p);
  const remoteLast = data ? Number(data.lastUpdatedAt || 0) : 0;
  const scoreProgressRichness = function(s){
    if(!s) return 0;
    const todayCount = Object.keys(s.todayStats || {}).length;
    const playedCount = Object.keys(s.playedDays || {}).length;
    const weeklyCount = (s.weeklyHistory || []).length;
    const topicCount = Object.keys(s.topicStars || {}).length;
    return Number(s.totalStars || 0)
      + Number(s.weekStars || 0)
      + (todayCount * 5)
      + (playedCount * 2)
      + (weeklyCount * 10)
      + topicCount;
  };
  let localNewer = false;
  if(!data){
    if(!localSnap) return;
    data = localSnap;
    localNewer = true;
  }else if(localSnap && Number(localSnap.lastUpdatedAt||0) > remoteLast){
    localNewer = true;
    data = localSnap;
  }else if(localSnap){
    // Guard against remote regressions: if cloud data is newer but clearly less complete,
    // keep richer local progress and mark it for re-sync.
    const localScore = scoreProgressRichness(localSnap);
    const remoteScore = scoreProgressRichness(data);
    if(localScore > remoteScore + 40){
      console.warn('Using richer local snapshot for', p, { localScore, remoteScore });
      localNewer = true;
      data = localSnap;
    }
  }
  if(currentPlayer===p && currentGameType) return; // guard mid-round
  const incomingUpdatedAt = Number(data.lastUpdatedAt || 0);
  const localUpdatedAt = Number(state[p]?.lastUpdatedAt || 0);
  if(incomingUpdatedAt && localUpdatedAt && incomingUpdatedAt < localUpdatedAt){
    console.warn('Skipping stale snapshot for', p, incomingUpdatedAt, localUpdatedAt);
    return;
  }
  // Week reset check (shared with endRound to prevent double-archive)
  applyWeekRolloverIfNeeded(data);
  // Streak reset if missed more than 1 day
  if(data.lastPlayed){
    const last=new Date(data.lastPlayed);
    const now=new Date();
    last.setHours(0,0,0,0);now.setHours(0,0,0,0);
    const diff=Math.round((now-last)/(1000*60*60*24));
    if(diff>1) data.streak=0;
  }
  // Safe field-by-field merge — never zero out existing counters
  const def=DEFAULT_STATE();
  state[p]=Object.assign({}, def, data);
  if(!state[p].failedWords) state[p].failedWords={};
  if(!state[p].playedDays) state[p].playedDays={};
  if(!state[p].todayStats) state[p].todayStats={};
  if(!state[p].weeklyHistory) state[p].weeklyHistory=[];
  if(!state[p].lastUpdatedAt) state[p].lastUpdatedAt=0;
  if(!state[p].dailyRounds) state[p].dailyRounds={};
  if(!state[p].dailyTimeMs) state[p].dailyTimeMs={};
  if(!state[p].gradeUnlocked) state[p].gradeUnlocked=defaultGradeUnlocked();
  clampGradeUnlocks(state[p].gradeUnlocked);
  if(!state[p].gradeStats) state[p].gradeStats={};
  if(!state[p].gradeGameRounds) state[p].gradeGameRounds={};
  if(!state[p].dailyTopicStats) state[p].dailyTopicStats={};
  ensureGradeParentOpenState(state[p]);
  const legacyTierClosed = !!(state[p].tier1Conquered && !state[p].tier1ParentOpen);
  if(legacyTierClosed){
    state[p].gradeParentOpen[4] = false;
    state[p].gradeParentOpen[5] = false;
  }
  closeGradesBelowWindow(state[p], highestUnlockedGrade(state[p]));
  if(state[p].tier1Conquered===undefined) state[p].tier1Conquered=false;
  if(state[p].tier2Conquered===undefined) state[p].tier2Conquered=false;
  if(state[p].tier3Conquered===undefined) state[p].tier3Conquered=false;
  if(state[p].tier1ParentOpen===undefined) state[p].tier1ParentOpen=false;
  if(state[p].tier2ParentOpen===undefined) state[p].tier2ParentOpen=false;
  if(state[p].tier3ParentOpen===undefined) state[p].tier3ParentOpen=false;
  if(!data.gradeUnlocked){
    state[p].gradeUnlocked = defaultGradeUnlocked();
  }
  if(!data.moons || data.moons.grade6 === undefined){
    state[p].moons = Object.assign({ grade4:false, grade5:false, grade6:false, grade7:false, grade8:false, grade9:false, grade10:false, super:false }, state[p].moons || {});
  }
  if(data.parentSettings){
    const merged=Object.assign(defaultParentSettings(), data.parentSettings);
    state.jenn.parentSettings=merged; state.jess.parentSettings=merged;
  }
  tryUnlockGradesAndTiers(state[p]);
  const patched = applySeedProfilePatchesIfNeeded(p, 'afterUnlock');
  syncMeta[p].lastCloudOk = Date.now();
  if(patched) await saveState(p, {patchOnly: true});
  if(localNewer || Number(state[p].lastUpdatedAt||0) > remoteLast){
    syncMeta[p].pendingCloud = true;
  }else{
    syncMeta[p].pendingCloud = false;
  }
  updateLeaderboard();
  if(currentPlayer===p) updateHub();
}

function initListeners(){
  if(listenersInitialized)return;
  if(!window.fbInit)return;
  listenersInitialized = true;
  ['jenn','jess'].forEach(p=>{
    window.fbInit(p, data => { void applyPlayerData(p, data); });
  });
}

// Previously this raced: the classic script ran during parse, before the deferred
// Firebase module, so window.fbInit was undefined here and the fbReady event did the
// real wiring — with `if(window.fbInit)` as a fallback for the other ordering. Now
// that everything is a module the ordering flips, so wait on the promise explicitly.
// Resolves to null when the CDN is unreachable; initListeners() already no-ops then.
void firebaseReady.then(initListeners);

async function saveState(player, opts){
  if(recoveryWriteFreeze){
    console.warn('Recovery freeze enabled, skipping save for', player);
    return;
  }
  // patchOnly: persist the patch locally + to cloud, but don't advance lastUpdatedAt.
  // This prevents startup patch saves from making the real Firebase load look stale.
  if(!opts || !opts.patchOnly){
    state[player].lastUpdatedAt = Date.now();
  }
  persistLocalStateMirror(player);
  updateConnectionStatusUI();
  if(window.fbSave){
    const ok = await window.fbSave(player, state[player]);
    if(ok){
      syncMeta[player].pendingCloud = false;
      syncMeta[player].lastCloudOk = Date.now();
      // Only suppress the echo when we know Firebase listeners are already live.
      // During startup patch saves, listeners aren't up yet so the first real
      // snapshot is NOT an echo — suppressing it would blank the profile.
      if(opts && opts.suppressEcho){
        syncMeta[player].suppressSnapshotUntil = Date.now() + 6000;
      }
    }else{
      syncMeta[player].pendingCloud = true;
    }
  }
  updateConnectionStatusUI();
}

// Partial flush on visibility change (item #6)
function flushOnExit(){
  if(!currentPlayer||!currentGameType)return;
  // Save failed words logged so far, don't save round score
  saveState(currentPlayer);
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    flushOnExit();
    flushPlayTimeTick(true);
  }
});

// ════════════════════════════════════════════════
// DAILY ROUNDS
// ════════════════════════════════════════════════
function roundsPlayedToday(player,gameType){
  const s=state[player];
  return(s.dailyRounds&&s.dailyRounds[`${todayKey()}_${gameType}`])||0;
}
function incrementRoundsToday(player,gameType){
  const s=state[player];
  if(!s.dailyRounds)s.dailyRounds={};
  const key=`${todayKey()}_${gameType}`;
  s.dailyRounds[key]=(s.dailyRounds[key]||0)+1;
}

// ════════════════════════════════════════════════
// SPACED REPETITION (items #2, #3, #6)
// ════════════════════════════════════════════════
function logFailure(word){
  if(!word||!word.fr)return;
  const s=state[currentPlayer];
  if(!s.failedWords)s.failedWords={};
  const key='fr:'+word.fr;
  const ex=s.failedWords[key]||{fr:word.fr,en:word.en,zh:word.zh||'',topic:word.topic||'',grade:currentGrade,failCount:0,successCount:0,lastFailed:null};
  ex.failCount++;ex.successCount=0;ex.lastFailed=todayKey();
  s.failedWords[key]=ex;
  updateTodayStat('wrong');
  // Do NOT call saveState mid-round — it triggers onSnapshot which corrupts weekStars
  // failedWords are saved at endRound and on visibilitychange
}
function logSuccess(word){
  if(!word||!word.fr)return;
  const s=state[currentPlayer];
  if(!s.failedWords)return;
  const key=`fr:${word.fr}`;
  if(s.failedWords[key]){
    s.failedWords[key].successCount++;
    if(s.failedWords[key].successCount>=2)delete s.failedWords[key];
  }
  updateTodayStat('correct');
}
function updateTodayStat(type){
  const s=state[currentPlayer];
  if(!s.todayStats)s.todayStats={};
  const k=todayKey();
  if(!s.todayStats[k])s.todayStats[k]={correct:0,wrong:0,rounds:0,stars:0};
  s.todayStats[k][type]=(s.todayStats[k][type]||0)+1;
}
function getRequeueWords(){
  const s=state[currentPlayer];
  if(!s.failedWords)return[];
  return Object.values(s.failedWords).sort((a,b)=>b.failCount-a.failCount);
}
function injectRequeue(pool,grade){
  const requeue=getRequeueWords().filter(w=>w.grade===grade).slice(0,4);
  const injected=[];
  requeue.forEach(w=>{
    const found=findVocabWord(w.fr, grade);
    if(found){injected.push(found);injected.push(found);}
  });
  return[...injected,...pool];
}

// ════════════════════════════════════════════════
// MOON CHECK
// ════════════════════════════════════════════════
function syncMoonsToTopicStars(s){
  if(!s.moons) s.moons={grade4:false,grade5:false,grade6:false,grade7:false,grade8:false,grade9:false,grade10:false,super:false};
  [4,5,6,7,8,9,10].forEach(g=>{
    const key='grade'+g;
    const topics=getTopics(g);
    if(!topics.length){ s.moons[key]=false; return; }
    s.moons[key]=topics.every(([k])=>(s.topicStars[`${g}_${k}`]||0)>=3);
  });
  const unlockedGrades=[4,5,6,7,8,9,10].filter(g=>s.gradeUnlocked&&s.gradeUnlocked[g]);
  if(unlockedGrades.length>=2){
    const top2=unlockedGrades.slice(-2);
    s.moons.super=top2.every(g=>s.moons['grade'+g]);
  }else{
    s.moons.super=false;
  }
}

function checkMoons(s){
  const newMoons=[];
  if(!s.moons) s.moons={grade4:false,grade5:false,grade6:false,grade7:false,grade8:false,grade9:false,grade10:false,super:false};
  const allThree=(grade)=>getTopics(grade).length>0&&getTopics(grade).every(([k])=>(s.topicStars[`${grade}_${k}`]||0)>=3);
  [4,5,6,7,8,9,10].forEach(g=>{
    const key='grade'+g;
    if(!s.moons[key]&&allThree(g)){
      s.moons[key]=true;
      newMoons.push({emoji:'🌙',label:'Grade '+g+' Moon',msg:'All topics in Grade '+g+' at 3⭐!'});
    }
  });
  // Superstar = moons on the two highest currently-unlocked grades
  const unlockedGrades=[4,5,6,7,8,9,10].filter(g=>s.gradeUnlocked&&s.gradeUnlocked[g]);
  if(unlockedGrades.length>=2){
    const top2=unlockedGrades.slice(-2);
    const bothMooned=top2.every(g=>s.moons['grade'+g]);
    if(!s.moons.super&&bothMooned){
      s.moons.super=true;
      newMoons.push({emoji:'🌟',label:'Superstar',msg:'Moons on G'+top2[0]+' & G'+top2[1]+' — superstar!'});
    }
  }
  return newMoons;
}

// ════════════════════════════════════════════════
// WEEKLY DOTS (item #11)
// ════════════════════════════════════════════════
function renderWeekDots(player){
  const s=state[player];
  const container=document.getElementById('lb-dots-'+player);
  if(!container)return;
  const labels=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  // Monday-anchored week start — same logic as getWeekStart()
  const now=new Date();
  const weekStart=new Date(now);
  weekStart.setHours(0,0,0,0);
  const day=weekStart.getDay();
  weekStart.setDate(weekStart.getDate()-(day===0?6:day-1));
  container.innerHTML='';
  labels.forEach((d,i)=>{
    const dayDate=new Date(weekStart);
    dayDate.setDate(weekStart.getDate()+i);
    const key=dayDate.getFullYear()+'-'+String(dayDate.getMonth()+1).padStart(2,'0')+'-'+String(dayDate.getDate()).padStart(2,'0');
    const played=s.playedDays&&s.playedDays[key];
    const isToday=key===todayKey();
    const col=document.createElement('div');col.style.textAlign='center';
    const dot=document.createElement('div');
    dot.className='lb-dot'+(played?' active-'+player:'')+(isToday?' today-dot':'');
    if(isToday) dot.style.outline='2px solid var(--gold)';
    const lbl=document.createElement('div');lbl.className='lb-dot-label';lbl.textContent=d;
    col.appendChild(dot);col.appendChild(lbl);container.appendChild(col);
  });
}

// ════════════════════════════════════════════════
// LEADERBOARD
// ════════════════════════════════════════════════
function updateLeaderboard(){
  ['jenn','jess'].forEach(p=>{
    const s=state[p];
    document.getElementById('lb-stars-'+p).textContent=s.totalStars;
    document.getElementById('lb-streak-'+p).textContent=s.streak;
    document.getElementById('lb-week-'+p).textContent=s.weekStars;
    document.getElementById('sel-stars-'+p).textContent='⭐ '+s.totalStars+' star pts';
    document.getElementById('sel-streak-'+p).textContent='🔥 '+s.streak+' day streak';
    const sd=document.getElementById('sel-daily-'+p);
    if(sd) sd.innerHTML=formatPlayerDailySummaryHTML(s);
    renderWeekDots(p);
  });
  const jennName=document.querySelector('.lb-row.jenn-row .lb-name');
  const jessName=document.querySelector('.lb-row.jess-row .lb-name');
  const jennWeek=Number(state.jenn?.weekStars||0);
  const jessWeek=Number(state.jess?.weekStars||0);
  const jennLead=jennWeek>jessWeek;
  const jessLead=jessWeek>jennWeek;
  if(jennName) jennName.classList.toggle('week-leader', jennLead);
  if(jessName) jessName.classList.toggle('week-leader', jessLead);
  // Days until next Monday
  const now2=new Date();
  const dayOfWeek=now2.getDay(); // 0=Sun
  const daysUntilMonday=dayOfWeek===0?1:(8-dayOfWeek);
  const nextMonday=new Date(now2);nextMonday.setHours(0,0,0,0);nextMonday.setDate(now2.getDate()+daysUntilMonday);
  const msLeft=nextMonday-new Date();
  const daysLeft=Math.ceil(msLeft/(1000*60*60*24));
  document.getElementById('week-reset-msg').textContent='Weekly star points reset every Monday — next reset in '+daysLeft+' day'+(daysLeft===1?'':'s');
}

// ════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════
function selectPlayer(p){
  if(!isWeekdayPlayAllowed()){
    pendingPlayer=p;
    const names=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const msgEl=document.getElementById('weekday-lock-msg');
    if(msgEl)msgEl.textContent='Today ('+names[new Date().getDay()]+') is blocked for screen time. Enter parent password to play anyway.';
    document.getElementById('weekday-lock-overlay').classList.add('show');
    return;
  }
  pendingPlayer=null;
  currentPlayer=p;currentGrade=4;
  hubDailySummaryOpen=false;
  const hdsb=document.getElementById('hub-daily-summary-block');
  const hdch=document.getElementById('hub-daily-chev');
  const hdbtn=document.getElementById('hub-daily-summary-btn');
  if(hdsb) hdsb.style.display='none';
  if(hdch) hdch.textContent='▼';
  if(hdbtn) hdbtn.setAttribute('aria-expanded','false');
  document.getElementById('wall-clock-display').style.display='none';
  document.getElementById('session-clock').style.display='flex';
  showScreen('hub');updateHub();
  startSessionClock();
  startPlayTimeTracker();
  updateConnectionStatusUI();
}
function goBack(){
  stopPlayTimeTracker();
  sessionWeekdayBypass=false;
  document.getElementById('wall-clock-display').style.display='block';
  document.getElementById('session-clock').style.display='none';
  showScreen('select');updateLeaderboard();
}
function exitGame(){if(currentPlayer&&currentGameType){persistRoundDraftNow();saveState(currentPlayer);}currentGameType=null;questions=[];showScreen('hub');document.getElementById('hint-panel').classList.remove('show');updateConnectionStatusUI();}
function showScreen(name){
  ['select','hub','game'].forEach(n=>document.getElementById(`screen-${n}`).style.display=n===name?'block':'none');
}
function setGrade(g){
  if(g > MAX_PLAYABLE_GRADE){
    showToast('🔒 G'+g+' — unlock the grade before: 🌙 Moon on G'+(g-1)+' + 2 days in a row at ≥95% on G'+(g-1)+'.','var(--gold)');
    return;
  }
  const s=state[currentPlayer];
  if(!s||!s.gradeUnlocked||!s.gradeUnlocked[g]){
    showToast('🔒 Locked — earn the previous grade Moon + 2 days ≥95% accuracy','var(--gold)');
    return;
  }
  if(!isGradePlayable(s,g)){
    showToast('🔒 Tier locked — ask parent to reopen in Parent Summary','var(--gold)');
    return;
  }
  currentGrade=g;
  for(let n=4;n<=10;n++){
    const el=document.getElementById('tab-g'+n);
    if(el) el.classList.toggle('active', n===g);
  }
  updateStarMap();
}
function refreshGradeTabs(){
  const s=state[currentPlayer];
  if(!s)return;
  [4,5,6,7,8,9,10].forEach(n=>{
    const el=document.getElementById('tab-g'+n);
    if(!el)return;
    el.classList.toggle('grade-tab-future', n>=6);
    const unlocked=s.gradeUnlocked&&s.gradeUnlocked[n];
    const play=isGradePlayable(s,n);
    el.classList.toggle('grade-locked',!play);
    if(!unlocked&&n>4){
      el.textContent='🔒 G'+n+' '+gateProgressLabel(s,n-1);
    } else if(!play){
      el.textContent='🔒 G'+n+' tier';
    } else {
      el.textContent='G'+n;
    }
  });
}

const DAILY_SLOGANS = [
  "Petit à petit, l'oiseau fait son nid! 🐦",
  "Every word you learn is a superpower! 💪",
  "你越练习，你越强！Keep going! 🌟",
  "Champions train every day — that's you! 🏆",
  "Une nouvelle journée, une nouvelle chance! ✨",
  "学法语很有趣，加油！🎉",
  "Progress, not perfection — you've got this! 🚀",
  "Chaque jour est une nouvelle aventure! 🌈",
  "勇敢学习，每天进步！Bravo! 🥳",
  "The more you practice, the luckier you get! 🍀",
  "Excellente journée pour apprendre! 📚",
  "今天的努力，是明天的成功！💫",
  "You are a French superstar in training! ⭐",
  "Courage! Tu peux le faire! 💥"
];
const DAILY_SLOGAN_EN = [
  "Little by little, the bird builds its nest! 🐦",
  "Every word you learn is a superpower! 💪",
  "The more you practice, the stronger you get! 🌟",
  "Champions train every day — that's you! 🏆",
  "A new day, a new chance! ✨",
  "Learning French is fun — keep going! 🎉",
  "Progress, not perfection — you've got this! 🚀",
  "Each day is a new adventure! 🌈",
  "Learn bravely and improve every day! Bravo! 🥳",
  "The more you practice, the luckier you get! 🍀",
  "Excellent day to learn! 📚",
  "Today's effort is tomorrow's success! 💫",
  "You are a French superstar in training! ⭐",
  "Courage! You can do it! 💥"
];
let sloganShowEnglish = false;

function getDailySlogan(){
  const dayNum = parseInt(todayKey().replace(/-/g,''));
  return DAILY_SLOGANS[dayNum % DAILY_SLOGANS.length];
}
function getDailySloganEnglish(){
  const dayNum = parseInt(todayKey().replace(/-/g,''));
  return DAILY_SLOGAN_EN[dayNum % DAILY_SLOGAN_EN.length];
}
function toggleSloganTranslation(){
  sloganShowEnglish=!sloganShowEnglish;
  if(currentPlayer) updateHub();
}

function renderHubDailySummaryInner(s, tk){
  const el=document.getElementById('hub-daily-summary-inner');
  if(!el) return;
  const gateGrade=latestGateGrade(s);
  const unlockedGrades=[4,5,6,7,8,9,10].filter(g=>s.gradeUnlocked&&s.gradeUnlocked[g]);
  const topTwo=unlockedGrades.slice(-2);
  const dynamicRows=topTwo.map(g=>{
    const acc=gradeDayAccuracy(s, tk, g);
    const lab=acc!==null?Math.round(acc*100)+'%':'—';
    return '<div class="hds-row"><span>G'+g+' accuracy (today)</span><span>'+lab+'</span></div>';
  }).join('');
  const gateAcc=gradeDayAccuracy(s, tk, gateGrade);
  const gateAccLabel=gateAcc!==null?Math.round(gateAcc*100)+'%':'—';
  const gateLine = gateGrade>=10
    ? '<div class="hds-row"><span>🔓 Gate to next grade</span><span>All grades unlocked</span></div>'
    : '<div class="hds-row"><span>🔓 Gate to next grade</span><span>'+gateProgressLabel(s, gateGrade)+' @ ≥95% + all 6 games on G'+gateGrade+'</span></div>';
  el.innerHTML='<p class="hds-rules" style="font-size:.72rem;color:var(--text-muted);margin:0 0 10px;line-height:1.45;"><strong>Mini-games:</strong> up to <strong>2 rounds per game type</strong> each day — separate from grade unlocking.<br><strong>Unlock next grade:</strong> earn the 🌙 Moon on the grade below, then <strong>≥95% accuracy</strong> on that grade and <strong>one complete round of every mini-game</strong> on that grade for <strong>2 days in a row</strong>.</p>'
    + dynamicRows
    +'<div class="hds-row"><span>Gate grade today</span><span>G'+gateGrade+' · '+gateAccLabel+'</span></div>'
    + gateLine;
}

let hubDailySummaryOpen = false;
function toggleHubDailySummary(){
  hubDailySummaryOpen = !hubDailySummaryOpen;
  const block = document.getElementById('hub-daily-summary-block');
  const btn = document.getElementById('hub-daily-summary-btn');
  const chev = document.getElementById('hub-daily-chev');
  if(block) block.style.display = hubDailySummaryOpen ? 'block' : 'none';
  if(btn) btn.setAttribute('aria-expanded', hubDailySummaryOpen ? 'true' : 'false');
  if(chev) chev.textContent = hubDailySummaryOpen ? '▲' : '▼';
  if(hubDailySummaryOpen && currentPlayer) renderHubDailySummaryInner(state[currentPlayer], todayKey());
}

function parentPracticeRowsHtml(words){
  if(!words || !words.length) return '';
  return words.map(function(w){
    return '<div class="parent-row"><div class="parent-fr">' + w.fr + '</div><div class="parent-en">' + w.en + '</div><div class="parent-zh">' + w.zh + '</div><div class="parent-fails">✗' + w.failCount + '</div></div>';
  }).join('');
}

function formatPlayerDailySummaryHTML(s){
  const tk=todayKey();
  const ts=s.todayStats&&s.todayStats[tk];
  const dayStars=ts&&ts.stars!=null?ts.stars:0;
  const drillDone=ts&&ts.drillDone;
  const rounds=ts?(ts.rounds||0):0;
  const rawMs=(s.dailyTimeMs&&s.dailyTimeMs[tk])||0;
  const timeShown=formatPlayTime(rawMs,true);
  const capHint=!sessionFullTimeReveal&&rawMs>DAILY_PLAY_CAP_MS?' <span style="opacity:.75">(30m+)</span>':'';
  return '<strong>Today</strong><br>⏱ French_game '+timeShown+capHint+'<br>⭐ '+dayStars+' pts · 🎮 '+rounds+' rounds<br>🏋️ '+(drillDone?'Drill ✅':'Drill —');
}

function updateHub(){
  const s=state[currentPlayer];
  const isJenn=currentPlayer==='jenn';
  document.getElementById('hub-header').className='hub-header '+currentPlayer;
  document.getElementById('hub-avatar').textContent=isJenn?'🐥':'🦊';
  document.getElementById('hub-name').textContent=isJenn?'Jenn':'Jess';
  document.getElementById('hub-stars').textContent=s.totalStars;
  document.getElementById('hub-streak').textContent=s.streak;
  document.getElementById('hub-week').textContent=s.weekStars;
  const moonLine=[4,5,6,7,8,9,10].map(g=>s.moons&&s.moons['grade'+g]?'🌙G'+g:'').filter(Boolean).join('  ')+(s.moons&&s.moons.super?'  🌟Super':'');
  document.getElementById('hub-moons').textContent=moonLine;
  const sloganText=getDailySlogan();
  const sloganEl=document.getElementById('hub-slogan');
  const sloganAct=document.getElementById('hub-slogan-actions');
  const sloganBtn=document.getElementById('hub-slogan-translate-btn');
  if(sloganEl){
    const isSameAsEnglish=sloganText===getDailySloganEnglish();
    const shown=sloganShowEnglish&&!isSameAsEnglish?getDailySloganEnglish():sloganText;
    sloganEl.textContent=shown;
    if(sloganAct)sloganAct.style.display=isSameAsEnglish?'none':'flex';
    if(sloganBtn&&!isSameAsEnglish)sloganBtn.textContent=sloganShowEnglish?'Show original':'Translate to English';
  }
  // Round badges
  ['quiz','match','scramble','builder','boss','listen'].forEach(type=>{
    const btn=document.getElementById('btn-'+type);if(!btn)return;
    const left=DAILY_ROUND_LIMIT-roundsPlayedToday(currentPlayer,type);
    const badge=btn.querySelector('.round-badge');
    if(badge){badge.textContent=left>0?left+' left today':'✅ Done today';badge.style.color=left>0?'var(--text-muted)':'var(--green)';}
    btn.style.opacity=left>0?'1':'0.6';
  });
  const tk=todayKey();
  const ts=s.todayStats&&s.todayStats[tk];
  const dayStars=ts&&ts.stars!=null?ts.stars:0;
  const drillDone=ts&&ts.drillDone;
  const rawMs=(s.dailyTimeMs&&s.dailyTimeMs[tk])||0;
  updateFrenchGameTimeDisplay();
  const ds=document.getElementById('hub-day-stars-val');
  if(ds) ds.textContent=String(dayStars);
  const dr=document.getElementById('hub-drill-val');
  if(dr) dr.textContent=drillDone?'✅ Done':'—';
  const rt=document.getElementById('hub-rounds-today-val');
  if(rt) rt.textContent=String(ts?(ts.rounds||0):0);
  const correctPeek=ts?(ts.correct||0):0;
  const wrongPeek=ts?(ts.wrong||0):0;
  const totPeek=correctPeek+wrongPeek;
  const accPeekEl=document.getElementById('hub-acc-today-val');
  if(accPeekEl) accPeekEl.textContent=totPeek>=5?Math.round(correctPeek/totPeek*100)+'%':'— (need 5+ tries)';
  if(hubDailySummaryOpen) renderHubDailySummaryInner(s, tk);
  refreshGradeTabs();
  updateStarMap();
  updateConnectionStatusUI();
}

function updateStarMap(){
  const s=state[currentPlayer];
  const grid=document.getElementById('sm-grid');grid.innerHTML='';
  const tk=todayKey();
  getTopics(currentGrade).forEach(([key,topic])=>{
    const stars=s.topicStars[`${currentGrade}_${key}`]||0;
    const div=document.createElement('div');
    div.className=`sm-topic${stars>=3?' mastered':''}`;
    const progressHtml=topicStarProgressHTML(s, tk, `${currentGrade}_${key}`, stars);
    div.innerHTML=`<span class="sm-topic-icon">${topic.icon}</span><div class="sm-topic-name">${topic.name}</div><div class="sm-stars">${'⭐'.repeat(Math.min(stars,3))}${'☆'.repeat(Math.max(0,3-stars))}</div>${progressHtml}`;
    grid.appendChild(div);
  });
}

// ════════════════════════════════════════════════
// SPEECH (item #4)
// ════════════════════════════════════════════════
function speakFrench(text){
  if(!speechSynth)return;
  speechSynth.cancel();
  const utt=new SpeechSynthesisUtterance(text);
  utt.lang='fr-FR';utt.rate=0.85;
  speechSynth.speak(utt);
}
// Build a 🔊 button that carries its French text as data rather than as
// interpolated JavaScript inside an onclick attribute. Apostrophes in words like
// aujourd'hui / l'ecole / j'ai used to produce syntactically invalid inline JS,
// leaving the button dead. Clicks are handled by one delegated listener below.
function escapeAttr(text){
  return String(text)
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function speakButtonHTML(text, cls, style){
  return '<button type="button" class="'+escapeAttr(cls||'')+'"'
    + (style ? ' style="'+escapeAttr(style)+'"' : '')
    + ' data-speak="'+escapeAttr(text)+'">\uD83D\uDD0A</button>';
}
document.addEventListener('click', function(e){
  const t = e.target && e.target.closest ? e.target.closest('[data-speak]') : null;
  if(t) speakFrench(t.getAttribute('data-speak'));
});

// Same idea for the remaining generated buttons: carry parameters as data
// attributes rather than interpolating them into an onclick string. None of
// these were broken (they interpolate numbers and enums), but restoreFromBackup
// interpolated a Firestore document id that comes from remote data, and keeping
// one rule for all of them makes the invariant testable.
document.addEventListener('click', function(e){
  const el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
  if(!el) return;
  switch(el.getAttribute('data-action')){
    case 'start-game':       startGame(el.getAttribute('data-game-type')); break;
    case 'toggle-weekday':   toggleWeekday(Number(el.getAttribute('data-day'))); break;
    case 'reopen-grade':     void reopenGradeForParent(Number(el.getAttribute('data-grade'))); break;
    case 'restore-backup':   void restoreFromBackup(el.getAttribute('data-player'),
                                                    el.getAttribute('data-backup-id')); break;
  }
});

function speakCurrent(){
  if(!currentQ)return;
  const text=currentQ.word?.fr||currentQ.parts?.join(' ')||'';
  if(text)speakFrench(text);
}
function startSpeech(){
  if(!recognition)return;
  const btn=document.getElementById('btn-stt');
  btn.classList.add('listening');btn.textContent='🎤...';
  recognition.start();
  recognition.onresult=e=>{
    const said=e.results[0][0].transcript.toLowerCase().trim();
    const target=(currentQ?.word?.fr||'').toLowerCase().trim();
    btn.classList.remove('listening');btn.textContent='🎤';
    const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(normalize(said)===normalize(target)){
      showToast('🎤 Parfait! Great pronunciation!');
    } else {
      showToast(`🎤 You said: "${said}" — try again!`,'var(--gold)');
    }
  };
  recognition.onerror=()=>{btn.classList.remove('listening');btn.textContent='🎤';};
}

// ════════════════════════════════════════════════
// GAME ENGINE
// ════════════════════════════════════════════════
function startGame(type){
  const played=roundsPlayedToday(currentPlayer,type);
  if(played>=DAILY_ROUND_LIMIT){showToast(`Come back tomorrow! ${DAILY_ROUND_LIMIT} rounds done today 🌙`,'var(--gold)');return;}
  currentGameType=type;
  const draft = loadRoundDraftForStart(type);
  const draftQuestion = draft && draft.questions && draft.questions.length ? draft.questions[draft.qIndex|0] : null;
  const isCompletedMatchDraft = !!(
    draftQuestion &&
    draftQuestion.type==='match' &&
    draft.matchPairs && draft.matchPairs.length &&
    draft.matchMatched && draft.matchMatched.length>=draft.matchPairs.length
  );
  const canResume = draft && draft.tk===todayKey() && draft.player===currentPlayer && draft.grade===currentGrade
    && draft.type===type && draft.questions && draft.questions.length && (draft.qIndex|0)<draft.questions.length
    && !isCompletedMatchDraft;
  if(canResume){
    restoreRoundDraft(draft);
  }else{
    clearCurrentRoundDraft();
    lives=3;roundScore=0;roundBasePoints=0;roundSpeedPoints=0;qIndex=0;roundTopicTally={};
    questions=buildQuestions(type);
    renderLives();renderScore();
    document.getElementById('progress-bar').style.width='0%';
    document.getElementById('hint-panel').classList.remove('show');
    renderQuestion();
    scheduleRoundDraftPersist();
  }
  showScreen('game');
  document.getElementById('game-title-bar').textContent={
    quiz:'🧠 Quick Quiz',match:'🎯 Word Match',
    scramble:'🔤 Scramble',builder:'💬 Sentence Builder',
    listen:'🎧 Listen & Speak',boss:'⚡ Boss Round'
  }[type];
  document.getElementById('btn-tts').style.display='inline-block';
  document.getElementById('btn-stt').style.display=recognition?'inline-block':'none';
  updateConnectionStatusUI();
  scheduleRoundDraftPersist();
}

function buildQuestions(type){
  if(type==='listen') return buildListenQuestions();
  const seed = dailyShuffleSeed() + currentGrade * 7919 + type.charCodeAt(0);
  const targetN = cumulativeVocabTarget(currentGrade);
  const allVocab = gradeFocusedVocabPool(currentGrade, targetN, seed + 11);
  const allSents = getSentencesExpanded(currentGrade, type.charCodeAt(0));
  const requeueFr = new Set(getRequeueWords().filter(w=>w.grade===currentGrade).map(w=>w.fr));
  const requeueVocab = allVocab.filter(w=>requeueFr.has(w.fr));
  const normalVocab = shuffleSeeded(allVocab.filter(w=>!requeueFr.has(w.fr)), seed + 33);
  const vocabPool = [...requeueVocab, ...normalVocab];
  const qs = [];
  const pickDistractors = (word, pool) => {
    return shuffleSeeded(pool.filter(w=>w.en!==word.en), seed + word.fr.length).slice(0,3).map(w=>w.en);
  };
  if(type==='quiz'){
    vocabPool.slice(0,8).forEach((word, i)=>{
      const distractors = pickDistractors(word, allVocab);
      qs.push({
        type:'quiz',
        prompt:'What does "'+word.fr+'" mean?',
        choices:shuffleSeeded([word.en,...distractors], seed + 100 + i),
        correct:word.en,
        hint:word.zh,
        word
      });
    });
  }
  if(type==='match'){
    qs.push({type:'match',pairs:vocabPool.slice(0,6).map(w=>({fr:w.fr,en:w.en,zh:w.zh,topic:w.topic,grade:w.grade}))});
  }
  if(type==='scramble'){
    vocabPool.slice(0,6).forEach((word, i)=>{
      const letters = shuffleSeeded(word.fr.replace(/[^a-zàâäéèêëîïôùûüç]/gi,'').split(''), seed + 200 + i);
      qs.push({type:'scramble',word,letters,hint:word.en});
    });
  }
  if(type==='builder'){
    shuffleSeeded(allSents, seed + 300).slice(0,5).forEach((s, i)=>{
      qs.push({type:'builder',...s,shuffled:shuffleSeeded(s.parts, seed + 400 + i)});
    });
  }
  if(type==='boss'){
    const bossVocab = mergeCarryoverVocab(currentGrade, expandVocabToTarget(getAllVocabCumulative(currentGrade), Math.min(80, cumulativeVocabTarget(currentGrade)), seed + 500), seed + 501);
    const bossSents = [...getSentencesExpanded(4, 1), ...getSentencesExpanded(currentGrade, 2)];
    bossVocab.slice(0,8).forEach((word, i)=>{
      const distractors = pickDistractors(word, bossVocab);
      qs.push({type:'quiz',prompt:'What does "'+word.fr+'" mean?',choices:shuffleSeeded([word.en,...distractors], seed + 600 + i),correct:word.en,hint:word.zh,word});
    });
    bossVocab.slice(8,12).forEach((word, i)=>{
      const letters = shuffleSeeded(word.fr.replace(/[^a-zàâäéèêëîïôùûüç]/gi,'').split(''), seed + 700 + i);
      qs.push({type:'scramble',word,letters,hint:word.en});
    });
    shuffleSeeded(bossSents, seed + 800).slice(0,3).forEach((s, i)=>{
      qs.push({type:'builder',...s,shuffled:shuffleSeeded(s.parts, seed + 900 + i)});
    });
  }
  return shuffleSeeded(qs, seed + 999);
}

function renderQuestion(){
  if(qIndex>=questions.length){endRound();return;}
  const q=questions[qIndex];currentQ=q;questionStartTime=Date.now();
  const area=document.getElementById('game-area'),actions=document.getElementById('action-row');
  area.innerHTML='';actions.innerHTML='';
  document.getElementById('hint-panel').classList.remove('show');
  document.getElementById('progress-bar').style.width=(qIndex/questions.length*100)+'%';
  if(q.type==='quiz')renderQuiz(q,area,actions);
  else if(q.type==='match')renderMatch(q,area,actions);
  else if(q.type==='scramble')renderScramble(q,area,actions);
  else if(q.type==='builder')renderBuilder(q,area,actions);
  else if(q.type==='listen')renderListenQuestion(q,area,actions);
}

// ── QUIZ — with inline 🔊 and bigger hint (#15 #16) ──
function renderQuiz(q,area,actions){
  area.innerHTML=''
    +'<div class="question-label">Translate to English</div>'
    +'<div class="question-main">'+q.prompt+'</div>'
    +'<button type="button" class="question-speak-inline" data-speak="'+escapeAttr(q.word.fr)+'">🔊 Hear it</button>'
    +'<div class="question-hint-big">💡 '+kidTopicCue(q.word)+' · 中文见家长页</div>'
    +'<div class="choices-grid" id="choices-grid"></div>';
  const grid=document.getElementById('choices-grid');
  q.choices.forEach(c=>{
    const btn=document.createElement('button');btn.className='choice-btn';btn.textContent=c;
    btn.onclick=()=>handleQuizAnswer(c,q,btn);grid.appendChild(btn);
  });
  actions.innerHTML='<button class="btn-secondary" onclick="showHint()">💡 Hint</button>';
  document.getElementById('hint-text').textContent='Parents: 中文提示 = '+q.hint;
  speakFrench(q.word.fr);
}
function handleQuizAnswer(choice,q,btn){
  document.querySelectorAll('.choice-btn').forEach(b=>b.disabled=true);
  const correct=choice===q.correct;
  btn.classList.add(correct?'correct':'wrong');
  document.querySelectorAll('.choice-btn').forEach(b=>{if(b.textContent===q.correct)b.classList.add('correct');});
  tallyTopicFromWord(q.word, correct);
  recordGradeAttempt(q.word.grade||currentGrade, correct);
  if(correct){logSuccess(q.word);showFeedback(true,q.word);}
  else{logFailure(q.word);showFeedback(false,q.word);if(applyWrongAttemptPenalty(1500))return;}
  scheduleRoundDraftPersist();
}

// ── MATCH ──
function renderMatch(q,area,actions){
  const snap = __roundDraftSnap;
  // Declared once for the whole function: the resume branch used to declare these
  // with `const` inside the if-block while the fresh branch used `var`, so on the
  // resume path the render loops below read the hoisted (undefined) `var` binding
  // and threw. Both branches now assign the same function-scoped bindings.
  let frWords, enWords;
  if(snap && currentQ && currentQ.type==='match' && snap.qIndex===qIndex && snap.matchPairs && snap.matchPairs.length){
    matchPairs = snap.matchPairs;
    matchMatched = snap.matchMatched || [];
    frWords = (snap.matchFrOrder && snap.matchFrOrder.length) ? snap.matchFrOrder : shuffleSeeded(matchPairs.map(p=>p.fr),dailyShuffleSeed()+889);
    enWords = (snap.matchEnOrder && snap.matchEnOrder.length) ? snap.matchEnOrder : shuffleSeeded(matchPairs.map(p=>p.en),dailyShuffleSeed()+890);
    // Restore the saved tile order too, otherwise the next draft save writes empty
    // orders and a second resume reshuffles the board under the child.
    matchFrOrder = frWords.slice();
    matchEnOrder = enWords.slice();
    if(snap.matchSelected && snap.matchSelected.side && snap.matchSelected.word){
      matchSelected = { btn: null, side: snap.matchSelected.side, word: snap.matchSelected.word };
    }else{
      matchSelected = null;
    }
  }else{
    matchPairs=shuffleSeeded(q.pairs,dailyShuffleSeed()+888);matchMatched=[];matchSelected=null;matchFrOrder=[];matchEnOrder=[];
    frWords=shuffleSeeded(matchPairs.map(p=>p.fr),dailyShuffleSeed()+889);
    enWords=shuffleSeeded(matchPairs.map(p=>p.en),dailyShuffleSeed()+890);
    matchFrOrder = frWords.slice();
    matchEnOrder = enWords.slice();
  }
  area.innerHTML=`<div class="question-label">Match French → English</div><div class="match-grid"><div class="match-col" id="fr-col"></div><div class="match-col" id="en-col"></div></div>`;
  frWords.forEach(w=>{
    const btn=document.createElement('button');btn.className='word-chip';btn.textContent=w;btn.dataset.side='fr';
    btn.onclick=()=>handleMatchClick(btn,'fr',w);document.getElementById('fr-col').appendChild(btn);
  });
  enWords.forEach(w=>{
    const btn=document.createElement('button');btn.className='word-chip';btn.textContent=w;btn.dataset.side='en';
    btn.onclick=()=>handleMatchClick(btn,'en',w);document.getElementById('en-col').appendChild(btn);
  });
  document.querySelectorAll('#fr-col .word-chip, #en-col .word-chip').forEach(function(b){
    const wtxt=b.textContent;
    const side=b.dataset.side;
    const matched=matchMatched.some(function(p){return (side==='fr'&&p.fr===wtxt)||(side==='en'&&p.en===wtxt);});
    if(matched){b.classList.add('used');b.style.borderColor='var(--green)';b.style.color='var(--green)';}
  });
  if(matchSelected && matchSelected.word){
    document.querySelectorAll('#fr-col .word-chip, #en-col .word-chip').forEach(function(b){
      if(!b.classList.contains('used') && b.textContent===matchSelected.word && b.dataset.side===matchSelected.side){
        b.style.borderColor='var(--french)';
        matchSelected.btn=b;
      }
    });
  }
}
function handleMatchClick(btn,side,word){
  if(btn.classList.contains('used'))return;
  if(!matchSelected){matchSelected={btn,side,word};btn.style.borderColor='var(--french)';return;}
  if(matchSelected.side===side){matchSelected.btn.style.borderColor='';matchSelected={btn,side,word};btn.style.borderColor='var(--french)';return;}
  const frW=side==='fr'?word:matchSelected.word,enW=side==='en'?word:matchSelected.word;
  const pair=matchPairs.find(p=>p.fr===frW&&p.en===enW);
  if(pair){
    [btn,matchSelected.btn].forEach(b=>{b.classList.add('used');b.style.borderColor='var(--green)';b.style.color='var(--green)';});
    matchMatched.push(pair);
    const fullW=findVocabWord(pair.fr)||pair;
    tallyTopicFromWord(fullW, true);
    recordGradeAttempt(fullW.grade||currentGrade, true);
    logSuccess(fullW);
    roundBasePoints+=5;
    roundScore=roundBasePoints+roundSpeedPoints;
    renderScore();
    showToast(`✅ ${pair.fr} = ${pair.en}!`);
    if(matchMatched.length===matchPairs.length)setTimeout(()=>showFeedback(true,null,`All ${matchPairs.length} pairs matched! 🎉`,null,null,{skipPoints:true}),400);
  } else {
    [btn,matchSelected.btn].forEach(b=>b.style.borderColor='var(--jenn)');
    setTimeout(()=>{[btn,matchSelected.btn].forEach(b=>b.style.borderColor='');},600);
    const failFr=side==='fr'?word:matchSelected.word;
    const failWord=matchPairs.find(p=>p.fr===failFr);
    if(failWord){
      const fullW=findVocabWord(failWord.fr)||failWord;
      tallyTopicFromWord(fullW, false);
      recordGradeAttempt(fullW.grade||currentGrade, false);
      logFailure(fullW);
    }
    applyWrongAttemptPenalty(1000);
  }
  matchSelected=null;
  scheduleRoundDraftPersist();
}

// ── SCRAMBLE ──
function renderScramble(q,area,actions){
  scrambleAnswer=[];scrambleSource=[...q.letters];currentQ=q;
  area.innerHTML='<div class="question-label">Unscramble the French word</div>'
    +'<div class="question-hint-big">🇬🇧 '+q.word.en+' &nbsp;·&nbsp; '+kidTopicCue(q.word)+'</div>'
    +'<div class="answer-slots" id="answer-slots"></div>'
    +'<div class="scramble-letters" id="scramble-letters"></div>';
  renderScrambleState(q);
  actions.innerHTML='<button class="btn-secondary" onclick="clearScramble()">Clear</button>'
    +'<button class="btn-primary" onclick="checkScramble(\''+q.word.fr.replace(/'/g,"\\'")+'\')">Check ✓</button>'
    +speakButtonHTML(q.word.fr,'question-speak-inline');
  speakFrench(q.word.fr);
}
function renderScrambleState(q){
  const slots=document.getElementById('answer-slots'),pool=document.getElementById('scramble-letters');
  if(!slots||!pool)return;
  slots.innerHTML='';pool.innerHTML='';
  scrambleAnswer.forEach((l,i)=>{
    const s=document.createElement('div');s.className='answer-slot filled';s.textContent=l;
    s.onclick=()=>{scrambleSource.push(l);scrambleAnswer.splice(i,1);renderScrambleState(currentQ);};
    slots.appendChild(s);
  });
  scrambleSource.forEach((l,i)=>{
    const tile=document.createElement('div');tile.className='letter-tile';tile.textContent=l;
    tile.onclick=()=>{scrambleAnswer.push(l);scrambleSource.splice(i,1);renderScrambleState(currentQ);};
    pool.appendChild(tile);
  });
  scheduleRoundDraftPersist();
}
function clearScramble(){scrambleSource=[...currentQ.letters];scrambleAnswer=[];renderScrambleState(currentQ);scheduleRoundDraftPersist();}
function checkScramble(target){
  const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const ok = normalize(scrambleAnswer.join(''))===normalize(target);
  tallyTopicFromWord(currentQ.word, ok);
  recordGradeAttempt(currentQ.word.grade||currentGrade, ok);
  if(ok){logSuccess(currentQ.word);showFeedback(true,currentQ.word);}
  else{logFailure(currentQ.word);showFeedback(false,currentQ.word,null,target);applyWrongAttemptPenalty(1500);}
  scheduleRoundDraftPersist();
}

// ── BUILDER ──
function renderBuilder(q,area,actions){
  builtWords=[];currentQ=q;
  area.innerHTML='<div class="question-label">Build this sentence in French</div>'
    +'<div class="sentence-target">🇬🇧 '+q.target+'<br>🇨🇳 '+q.zh+'</div>'
    +'<div class="built-sentence" id="built-sentence"></div>'
    +'<div class="word-bank" id="word-bank"></div>';
  renderBuilderState(q);
  actions.innerHTML='<button class="btn-secondary" onclick="clearBuilder()">Clear</button>'
    +'<button class="btn-primary" onclick="checkBuilder()">Check ✓</button>'
    +speakButtonHTML(q.parts.join(' '),'question-speak-inline');
}
function renderBuilderState(q){
  const built=document.getElementById('built-sentence'),bank=document.getElementById('word-bank');
  if(!built||!bank)return;
  built.innerHTML=builtWords.length?builtWords.map((w,i)=>`<div class="built-word" onclick="removeBuilt(${i})">${w}</div>`).join(''):'<span style="color:var(--text-muted);font-size:.82rem;">Tap words below</span>';
  bank.innerHTML='';
  const usedCount={};builtWords.forEach(w=>{usedCount[w]=(usedCount[w]||0)+1;});
  const seen={};
  q.shuffled.forEach(w=>{
    if(seen[w])return;seen[w]=true;
    const chip=document.createElement('div');
    const exhausted=(usedCount[w]||0)>=(q.shuffled.filter(x=>x===w).length);
    const isPunct=/^[.!?,;:…]$/.test(w);
    chip.className='word-chip'+(exhausted?' used':'')+(isPunct?' punct':'');chip.textContent=w;
    chip.onclick=()=>{if((builtWords.filter(b=>b===w).length)<(q.shuffled.filter(s=>s===w).length)){builtWords.push(w);renderBuilderState(q);}};
    bank.appendChild(chip);
  });
  scheduleRoundDraftPersist();
}
function removeBuilt(i){builtWords.splice(i,1);renderBuilderState(currentQ);scheduleRoundDraftPersist();}
function clearBuilder(){builtWords=[];renderBuilderState(currentQ);scheduleRoundDraftPersist();}
function checkBuilder(){
  const answer=builtWords.join(' '),correct=currentQ.parts.join(' ');
  if(answer===correct){
    currentQ.parts.forEach(p=>{
      const f=findVocabWord(p);
      if(f){ logSuccess(f); tallyTopicFromWord(f, true); }
    });
    recordGradeAttempt(currentGrade, true);
    showFeedback(true,null,currentQ.target);
    speakFrench(correct);
  } else {
    const wrongParts=builtWords.filter((w,i)=>w!==currentQ.parts[i]);
    currentQ.parts.forEach(p=>{
      const f=findVocabWord(p);
      if(f){ logFailure(f); tallyTopicFromWord(f, false); }
    });
    recordGradeAttempt(currentGrade, false);
    showFeedback(false,null,currentQ.target,correct,wrongParts);
    applyWrongAttemptPenalty(1500);
  }
  scheduleRoundDraftPersist();
}

// ════════════════════════════════════════════════
// FEEDBACK (item #1)
// ════════════════════════════════════════════════
function showHint(){document.getElementById('hint-panel').classList.add('show');}

function showFeedback(correct,word=null,extra='',correctAnswer=null,wrongParts=null,opts){
  opts=opts||{};
  const overlay=document.getElementById('feedback-overlay');
  const base=correct?(lives===3?15:lives===2?10:5):0;
  const elapsed=Date.now()-questionStartTime;
  const speedBonus=(correct&&!opts.skipPoints&&currentGameType!=='match'&&elapsed<SPEED_BONUS_WINDOW)?Math.round(SPEED_BONUS_MAX*(1-elapsed/SPEED_BONUS_WINDOW)):0;

  document.getElementById('fb-emoji').textContent=correct?rand(['🎉','🌟','🥳','✨','🏆','💫']):rand(['😅','💪','🤔','📚']);
  document.getElementById('fb-title').textContent=correct?rand(['Super!','Excellent!','Parfait!','Bravo!','Fantastique!']):'Almost!';
  document.getElementById('fb-msg').textContent=word?(`${word.fr} = ${word.en}`+(word.zh?` (中文 → parents)`:'')):extra||'';
  if(correct && !opts.skipPoints){
    document.getElementById('fb-points').textContent='+'+base+' star pts'+(speedBonus>0?' + ⚡'+speedBonus+' speed':'');
  } else if(correct && opts.skipPoints){
    document.getElementById('fb-points').textContent=extra||'Nice!';
  } else {
    document.getElementById('fb-points').textContent='Keep trying!';
  }

  const correctDisplay=document.getElementById('fb-correct-display');
  if(!correct&&(word||correctAnswer)){
    const displayWord=word?word.fr:correctAnswer;
    const displaySub=word?`${word.en} (中文见家长页)`:'';
    let wrongHTML='';
    if(wrongParts&&wrongParts.length>0){
      wrongHTML=`<div style="font-size:.75rem;color:var(--text-muted);margin-top:6px;">Wrong parts: ${wrongParts.map(p=>`<span class="wrong-part-highlight">${p}</span>`).join(' ')}</div>`;
    }
    correctDisplay.innerHTML=`<div class="correct-answer-display"><div class="correct-answer-label">✓ Correct Answer</div><div class="correct-answer-word">${displayWord}</div>${displaySub?`<div class="correct-answer-sub">${displaySub}</div>`:''}${wrongHTML}</div>`;
  } else {correctDisplay.innerHTML='';}

  if(correct && !opts.skipPoints){
    roundBasePoints+=base;
    roundSpeedPoints+=speedBonus;
    roundScore=roundBasePoints+roundSpeedPoints;
    renderScore();
    if(speedBonus>=7||base>=15)confetti();
  } else if(correct && opts.skipPoints){
    confetti();
  }
  overlay.classList.add('show');
  scheduleRoundDraftPersist();
}

function nextQuestion(){document.getElementById('feedback-overlay').classList.remove('show');qIndex++;renderQuestion();scheduleRoundDraftPersist();}

// ════════════════════════════════════════════════
// ROUND END
// ════════════════════════════════════════════════
async function endRound(){
  clearCurrentRoundDraft();
  document.getElementById('feedback-overlay').classList.remove('show');
  const lpStars=roundScore>=80?3:roundScore>=40?2:roundScore>=15?1:0;
  const area=document.getElementById('game-area'),actions=document.getElementById('action-row');
  if(lpStars>0)confetti();

  const s=state[currentPlayer];

  applyWeekRolloverIfNeeded(s);

  s.totalStars+=roundScore;
  s.weekStars+=roundScore;
  incrementRoundsToday(currentPlayer,currentGameType);
  markGradeRoundComplete(s, todayKey(), currentGrade, currentGameType);
  const roundsLeft=DAILY_ROUND_LIMIT-roundsPlayedToday(currentPlayer,currentGameType);

  const touchedTopicKeys = [];
  Object.entries(roundTopicTally).forEach(([tk, o])=>{
    const tot=o.c+o.w;
    if(tot===0)return;
    mergeRoundTopicIntoDaily(s, todayKey(), tk, currentGameType, o.c, o.w);
    touchedTopicKeys.push(tk);
  });
  touchedTopicKeys.forEach((tk)=>{
    const st = computeTopicStarFromDaily(s, todayKey(), tk);
    if(st>0)s.topicStars[tk]=Math.max(s.topicStars[tk]||0, st);
  });

  const unl=tryUnlockGradesAndTiers(s);
  let unlockLine='';
  if(unl.length){
    unlockLine='<div class="unlock-banner">'+unl.map(u=>{
      if(typeof u==='number')return '🔓 Grade '+u+' unlocked!';
      return '';
    }).filter(Boolean).join(' · ')+'</div>';
  }

  let maxTopicTier=0;
  touchedTopicKeys.forEach((tk)=>{
    const st=computeTopicStarFromDaily(s, todayKey(), tk);
    if(st>maxTopicTier)maxTopicTier=st;
  });

  const today=new Date().toDateString();
  if(s.lastPlayed!==today){s.streak++;s.lastPlayed=today;}
  if(!s.playedDays)s.playedDays={};s.playedDays[todayKey()]=true;

  if(!s.todayStats)s.todayStats={};
  const tk=todayKey();
  if(!s.todayStats[tk])s.todayStats[tk]={correct:0,wrong:0,rounds:0,stars:0};
  s.todayStats[tk].rounds++;s.todayStats[tk].stars+=roundScore;

  const newMoons=checkMoons(s);
  let moonHTML='';
  if(newMoons.length>0){
    moonHTML=newMoons.map(m=>`<div class="moon-banner"><div class="moon-emoji">${m.emoji}</div><div class="moon-label">${m.label}</div><div class="moon-msg">${m.msg}</div></div>`).join('');
    confetti();confetti();
  }
  const moonTrophies=[4,5,6,7,8,9,10].map(g=>s.moons&&s.moons['grade'+g]?'🌙G'+g:'').filter(Boolean).join(' ')+(s.moons&&s.moons.super?' · 🌟Super':'');

  area.innerHTML=unlockLine+`<div class="round-complete">
    <div class="rc-stars">${'⭐'.repeat(maxTopicTier)}${'☆'.repeat(Math.max(0,3-maxTopicTier))}</div>
    <div class="rc-title">${maxTopicTier===3?'🏆 Topic round!':maxTopicTier===2?'🎉 Strong topics!':maxTopicTier===1?'👍 Topics improving!':'Keep practicing topics!'}</div>
    <div class="rc-score">Leaderboard star points · +${roundBasePoints} base + ${roundSpeedPoints} speed = ${roundScore}</div>
    <div class="rc-breakdown">
      <div class="rc-stat"><span class="rc-stat-val">${roundBasePoints}</span><span class="rc-stat-lbl">Base</span></div>
      <div class="rc-stat"><span class="rc-stat-val">${roundSpeedPoints}</span><span class="rc-stat-lbl">Speed</span></div>
      <div class="rc-stat"><span class="rc-stat-val">${lives}</span><span class="rc-stat-lbl">Lives</span></div>
      <div class="rc-stat"><span class="rc-stat-val">${roundsLeft}</span><span class="rc-stat-lbl">Rounds left</span></div>
    </div>
    ${moonTrophies?`<div style="color:var(--gold);font-size:.85rem;margin-top:6px;">${moonTrophies}</div>`:''}
    ${moonHTML}
  </div>`;

  actions.innerHTML=`${roundsLeft>0?`<button class="btn-primary" data-action="start-game" data-game-type="${escapeAttr(currentGameType)}">Play Again (${roundsLeft})</button>`:`<button class="btn-primary" style="opacity:.5;cursor:not-allowed;" disabled>Done today! 🌙</button>`}<button class="btn-secondary" onclick="exitGame()">Hub</button>`;

  await saveState(currentPlayer, {suppressEcho: true});
  triggerDailyBackup(currentPlayer);
  updateLeaderboard();updateHub();
}

function renderLives(){document.getElementById('game-lives').textContent='❤️'.repeat(Math.max(0,lives))+'🖤'.repeat(Math.max(0,3-lives));}
function renderScore(){document.getElementById('game-score').textContent=roundScore;}

// ════════════════════════════════════════════════
// MY WORDS — merged Conquer + Training (#18)
// ════════════════════════════════════════════════
let myWordsMode = 'list';
let trainIndex = 0, trainWords = [];

function showMyWords(){
  myWordsMode = 'list';
  document.getElementById('mw-tab-list').classList.add('active');
  document.getElementById('mw-tab-drill').classList.remove('active');
  renderMyWordsList();
  document.getElementById('mywords-overlay').classList.add('show');
}

function showMyWordsTab(tab){
  myWordsMode = tab;
  document.getElementById('mw-tab-list').classList.toggle('active', tab==='list');
  document.getElementById('mw-tab-drill').classList.toggle('active', tab==='drill');
  if(tab==='list') renderMyWordsList();
  else renderMyWordsDrill();
}

function renderMyWordsList(){
  const queue = getRequeueWords();
  const el = document.getElementById('mywords-content');
  if(queue.length===0){
    el.innerHTML='<div class="empty-state">🌟 No words in your queue — you\'re crushing it!</div>';
    return;
  }
  el.innerHTML = queue.slice(0,15).map(w=>{
    const prog = Math.min(w.successCount/2,1);
    return '<div class="conquer-word">'
      +'<div class="conquer-fr">'+w.fr+'</div>'
      +'<div class="conquer-right"><div class="conquer-en">'+w.en+'</div><div class="conquer-zh">'+w.zh+'</div></div>'
      +'<div><div class="conquer-prog"><div class="conquer-prog-fill" style="width:'+Math.round(prog*100)+'%"></div></div></div>'
      +speakButtonHTML(w.fr,'','background:none;border:none;cursor:pointer;font-size:1.2rem;padding:4px;touch-action:manipulation;')
      +'</div>';
  }).join('')
  +'<div style="text-align:center;margin-top:14px;">'
  +'<button class="btn-primary" onclick="showMyWordsTab(\'drill\')">Start Drill 🏋️</button>'
  +'</div>';
}

function renderMyWordsDrill(){
  trainWords = getRequeueWords();
  trainIndex = 0;
  if(trainWords.length===0){
    document.getElementById('mywords-content').innerHTML='<div class="empty-state">🎉 No words to drill! Play some games first.</div>';
    return;
  }
  renderDrillCard();
}

function renderDrillCard(){
  const el = document.getElementById('mywords-content');
  if(trainIndex >= trainWords.length){
    if(trainWords.length>0&&currentPlayer){
      const s=state[currentPlayer];
      const tk=todayKey();
      if(!s.todayStats)s.todayStats={};
      if(!s.todayStats[tk])s.todayStats[tk]={correct:0,wrong:0,rounds:0,stars:0};
      s.todayStats[tk].drillDone=1;
      s.lastDrillComplete=tk;
      saveState(currentPlayer);
      updateHub();
    }
    el.innerHTML='<div class="empty-state">🎉 You drilled all your words! Amazing!</div>'
      +'<div style="text-align:center;color:var(--green);font-size:.85rem;margin-top:8px;">✅ Saved — check Today on your profile & parent summary.</div>'
      +'<div style="text-align:center;margin-top:12px;"><button class="btn-primary" onclick="showMyWordsTab(\'list\')">← Back to List</button></div>';
    return;
  }
  const w = trainWords[trainIndex];
  const sents = getSentences(w.grade||currentGrade);
  const matchSent = sents.find(s=>s.parts.includes(w.fr));
  let drillHTML = '';
  if(matchSent){
    const blanked = matchSent.parts.map(p=>p===w.fr?'______':p).join(' ');
    drillHTML = '<div style="font-size:.85rem;color:var(--text-muted);margin-bottom:8px;">🇬🇧 '+matchSent.target+'</div>'
      +'<div style="font-family:\'Fredoka One\',cursive;font-size:1.1rem;margin-bottom:12px;">'+blanked+'</div>';
  } else {
    drillHTML = '<div style="font-size:.85rem;color:var(--text-muted);margin-bottom:8px;">Translate:</div>'
      +'<div style="font-family:\'Fredoka One\',cursive;font-size:1.4rem;color:var(--french);margin-bottom:12px;">'+w.en+'</div>';
  }
  el.innerHTML = '<div class="train-card">'
    +drillHTML
    +'<input class="train-input" id="train-input" placeholder="Type in French..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">'
    +'<div style="font-size:.7rem;color:var(--text-muted);margin-top:8px;">'+(trainIndex+1)+' / '+trainWords.length+'</div>'
    +'</div>'
    +'<div class="action-row" style="margin-top:12px;">'
    +'<button class="btn-secondary" onclick="revealDrill()">Reveal</button>'
    +'<button class="btn-primary" onclick="checkDrill(\''+w.fr.replace(/'/g,"\\'")+'\')" >Check ✓</button>'
    +speakButtonHTML(w.fr,'btn-speak','touch-action:manipulation;')
    +'</div>';
  setTimeout(()=>document.getElementById('train-input')?.focus(),100);
}

function checkDrill(target){
  const answer = (document.getElementById('train-input')?.value||'').trim();
  const normalize = s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(normalize(answer)===normalize(target)){
    showToast('✅ Correct!');
    const w = trainWords[trainIndex];
    const vocabW = findVocabWord(w.fr, w.grade||currentGrade)||w;
    logSuccess(vocabW);
    saveState(currentPlayer);
    trainIndex++;
    setTimeout(renderDrillCard, 600);
  } else {
    showToast('❌ Answer: '+target, 'var(--jenn)');
    saveState(currentPlayer);
    setTimeout(()=>{trainIndex++;renderDrillCard();}, 1600);
  }
}

function revealDrill(){
  const w = trainWords[trainIndex];
  showToast('💡 '+w.fr, 'var(--gold)');
  setTimeout(()=>{trainIndex++;renderDrillCard();}, 1800);
}

// ════════════════════════════════════════════════
// DAILY STUDY (item #10)
// ════════════════════════════════════════════════
let currentStudySet=1;
function showStudy(){
  currentStudySet=1;
  document.querySelectorAll('.study-set-tab').forEach((t,i)=>t.classList.toggle('active',i===0));
  renderStudySet(1);
  document.getElementById('study-overlay').classList.add('show');
}
function showStudySet(n){
  currentStudySet=n;
  document.querySelectorAll('.study-set-tab').forEach((t,i)=>t.classList.toggle('active',i===n-1));
  renderStudySet(n);
}
function renderStudySet(n){
  const content=document.getElementById('study-content');
  // Seed daily sets from date so they're consistent all day
  const seed=parseInt(todayKey().replace(/-/g,''));
  const seededShuffle=(arr,s)=>{let a=[...arr];for(let i=a.length-1;i>0;i--){const j=(s+i)%a.length;[a[i],a[j]]=[a[j],a[i]];}return a;};

  if(n===1){
    // Set 1 — shared vocab cards
    const vocab=seededShuffle(getAllVocabCumulative(currentGrade),seed).slice(0,9);
    content.innerHTML=`<div class="study-grid">${vocab.map(w=>`
      <div class="study-mini">
        <div class="study-mini-fr">${w.fr}</div>
        <div class="study-mini-en">${w.en}</div>
        <div class="study-mini-zh">${w.zh}</div>
        ${speakButtonHTML(w.fr,'','background:none;border:none;cursor:pointer;margin-top:4px;')}
      </div>`).join('')}</div>`;
  } else if(n===2){
    // Set 2 — shared sentence patterns
    const sents=seededShuffle(getSentences(currentGrade),seed+1).slice(0,4);
    content.innerHTML=sents.map(s=>`
      <div class="study-card">
        <div class="study-card-fr">${s.parts.join(' ')}</div>
        <div class="study-card-en">${s.target}</div>
        <div class="study-card-zh">${s.zh}</div>
        ${speakButtonHTML(s.parts.join(' '),'','background:none;border:none;cursor:pointer;margin-top:8px;font-size:1.2rem;')}
      </div>`).join('');
  } else {
    // Set 3 — personalized: failed words first
    const queue=getRequeueWords().slice(0,8);
    if(queue.length===0){
      const vocab=seededShuffle(getAllVocabCumulative(currentGrade),seed+2).slice(0,6);
      content.innerHTML=`<div style="text-align:center;color:var(--green);font-size:.85rem;margin-bottom:10px;">✅ No words in your practice queue — great work!</div><div class="study-grid">${vocab.map(w=>`<div class="study-mini"><div class="study-mini-fr">${w.fr}</div><div class="study-mini-en">${w.en}</div><div class="study-mini-zh">${w.zh}</div></div>`).join('')}</div>`;
    } else {
      content.innerHTML=`<div style="text-align:center;color:var(--purple);font-size:.82rem;margin-bottom:10px;">💪 Your personal practice words — let's review them!</div>`+
        queue.map(w=>`<div class="study-card" style="padding:14px;">
          <div class="study-card-fr">${w.fr}</div>
          <div class="study-card-en">${w.en}</div>
          <div class="study-card-zh">${w.zh}</div>
          ${speakButtonHTML(w.fr,'','background:none;border:none;cursor:pointer;margin-top:6px;')}
        </div>`).join('');
    }
  }
}

// ════════════════════════════════════════════════
// LISTEN & SPEAK GAME (#16)
// ════════════════════════════════════════════════
function buildListenQuestions(){
  const seed = dailyShuffleSeed() + currentGrade * 9127;
  const vocab = expandVocabToTarget(getAllVocabCumulative(currentGrade), cumulativeVocabTarget(currentGrade), seed);
  const pool = injectRequeue(vocab, currentGrade);
  return shuffleSeeded(pool, seed + 3).slice(0,8).map(word=>({
    type:'listen', word,
    hint: word.en
  }));
}

function renderListenQuestion(q, area, actions){
  area.innerHTML = '<div class="listen-card">'
    +'<div class="listen-prompt">Listen and type the French word you hear</div>'
    +'<button class="listen-play-btn" id="listen-play-btn" onclick="speakAndReveal()" title="Play">🔊</button>'
    +'<div style="font-size:.85rem;color:var(--text-muted);margin-bottom:12px;">💡 '+kidTopicCue(q.word)+' · EN: '+q.hint+' · 中文见家长页</div>'
    +'<input class="train-input" id="listen-input" placeholder="Type what you hear..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" style="width:100%;max-width:320px;">'
    +'</div>';

  actions.innerHTML = '<button class="btn-secondary" onclick="speakAndReveal()">🔊 Play Again</button>'
    +(recognition ? '<button class="btn-speak" id="btn-stt-listen" onclick="startListenSpeech()">🎤 Speak</button>' : '')
    +'<button class="btn-primary" onclick="checkListenAnswer()">Check ✓</button>';

  // Auto-play on question load
  setTimeout(()=>speakFrench(q.word.fr), 400);
  setTimeout(()=>document.getElementById('listen-input')?.focus(), 600);
}

function speakAndReveal(){
  if(currentQ?.word?.fr) speakFrench(currentQ.word.fr);
}

function checkListenAnswer(){
  const answer = (document.getElementById('listen-input')?.value||'').trim();
  const target = currentQ?.word?.fr||'';
  const normalize = s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const ok = normalize(answer)===normalize(target);
  tallyTopicFromWord(currentQ.word, ok);
  recordGradeAttempt(currentQ.word.grade||currentGrade, ok);
  if(ok){
    logSuccess(currentQ.word);
    showFeedback(true, currentQ.word);
  } else {
    logFailure(currentQ.word);
    showFeedback(false, currentQ.word);
    applyWrongAttemptPenalty(1500);
  }
  scheduleRoundDraftPersist();
}

function startListenSpeech(){
  if(!recognition) return;
  const btn = document.getElementById('btn-stt-listen');
  if(btn){btn.classList.add('listening');btn.textContent='🎤...';}
  recognition.start();
  recognition.onresult = e=>{
    const said = e.results[0][0].transcript.toLowerCase().trim();
    if(btn){btn.classList.remove('listening');btn.textContent='🎤 Speak';}
    const input = document.getElementById('listen-input');
    if(input) input.value = said;
    checkListenAnswer();
  };
  recognition.onerror = ()=>{
    if(btn){btn.classList.remove('listening');btn.textContent='🎤 Speak';}
  };
}

// ════════════════════════════════════════════════
// PARENT SUMMARY — weekly + daily + prev nav
// ════════════════════════════════════════════════
let summaryWeekOffset = 0;

function setSummaryMode(mode){
  summaryMode = mode;
  const bw = document.getElementById('summary-btn-weekly');
  const bd = document.getElementById('summary-btn-daily');
  if(bw) bw.classList.toggle('active', mode === 'weekly');
  if(bd) bd.classList.toggle('active', mode === 'daily');
  summaryWeekOffset = 0;
  dailySummaryOffset = 0;
  renderParentSummary();
}

function showParentSummary(){
  summaryMode = 'weekly';
  summaryWeekOffset = 0;
  dailySummaryOffset = 0;
  const bw = document.getElementById('summary-btn-weekly');
  const bd = document.getElementById('summary-btn-daily');
  if(bw) bw.classList.add('active');
  if(bd) bd.classList.remove('active');
  renderWeekdayGrid();
  renderParentGradeReopenControls();
  renderParentSummary();
  document.getElementById('parent-overlay').classList.add('show');
}

function navSummaryWeek(delta){
  summaryWeekOffset += delta;
  if(summaryWeekOffset > 0) summaryWeekOffset = 0;
  if(summaryWeekOffset < -3) summaryWeekOffset = -3;
  renderParentSummary();
}

function navDailySummary(delta){
  dailySummaryOffset += delta;
  if(dailySummaryOffset > 0) dailySummaryOffset = 0;
  if(dailySummaryOffset < -13) dailySummaryOffset = -13;
  renderParentSummary();
}

function renderWeekdayGrid(){
  const g = document.getElementById('weekday-grid');
  if(!g) return;
  const ps = getParentSettings();
  const labels = ['S','M','T','W','T','F','S'];
  g.innerHTML = labels.map((lbl, i) =>
    '<button type="button" class="weekday-chip ' + (ps.weekdayOpen[i] ? 'on' : 'off') + '" data-action="toggle-weekday" data-day="' + i + '">' + lbl + '</button>'
  ).join('');
}

function renderParentGradeReopenControls(){
  const wrap = document.getElementById('parent-grade-reopen-controls');
  if(!wrap) return;
  const sourcePlayer = currentPlayer || 'jenn';
  const s = state[sourcePlayer];
  if(!s || !s.gradeUnlocked){
    wrap.innerHTML = '<div style="font-size:.68rem;color:var(--text-muted);">No closed grades to reopen right now.</div>';
    return;
  }
  ensureGradeParentOpenState(s);
  const top = highestUnlockedGrade(s);
  const rows = [];
  for(let g = 4; g <= 10; g++){
    if(!s.gradeUnlocked[g]) continue;
    if(g >= top - 1) continue;
    if(s.gradeParentOpen[g]) continue;
    rows.push('<button type="button" class="btn-secondary" data-action="reopen-grade" data-grade="'+g+'" style="padding:6px 10px;font-size:.7rem;">Reopen G'+g+'</button>');
  }
  wrap.innerHTML = rows.length ? rows.join('') : '<div style="font-size:.68rem;color:var(--text-muted);">No closed grades to reopen right now.</div>';
}

async function toggleWeekday(i){
  const ps = Object.assign({}, getParentSettings());
  ps.weekdayOpen[i] = !ps.weekdayOpen[i];
  state.jenn.parentSettings = ps;
  state.jess.parentSettings = ps;
  await saveState('jenn');
  await saveState('jess');
  renderWeekdayGrid();
}

function renderParentSummary(){
  const grid = document.getElementById('parent-stats-grid');
  const nav = document.getElementById('summary-nav');
  grid.innerHTML = '';

  const today = todayKey();
  const weekStart = getWeekStart();

  if(summaryMode === 'daily'){
    const dKey = dateKeyAddDays(dailySummaryOffset);
    const dLabel = dailySummaryOffset === 0 ? 'Today' : dailySummaryOffset === -1 ? 'Yesterday' : dKey;
    if(nav){
      nav.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
        + '<button class="btn-secondary" onclick="navDailySummary(-1)" style="padding:6px 12px;font-size:.8rem;"' + (dailySummaryOffset <= -13 ? ' disabled' : '') + '>← Prev day</button>'
        + '<div style="font-family:\'Fredoka One\',cursive;font-size:1rem;color:var(--gold);">Daily · ' + dLabel + '</div>'
        + '<button class="btn-secondary" onclick="navDailySummary(1)" style="padding:6px 12px;font-size:.8rem;"' + (dailySummaryOffset >= 0 ? ' disabled' : '') + '>Next day →</button>'
        + '</div>';
    }
    ['jenn', 'jess'].forEach(p => {
      const s = state[p];
      const ts = (s.todayStats && s.todayStats[dKey]) || {};
      const dayStars = ts.stars || 0;
      const correct = ts.correct || 0;
      const wrong = ts.wrong || 0;
      const rounds = ts.rounds || 0;
      const drillDone = ts.drillDone;
      const rawMs = (s.dailyTimeMs && s.dailyTimeMs[dKey]) || 0;
      const timeStr = formatPlayTime(rawMs, true) + (sessionFullTimeReveal ? '' : ' (capped 30m)');
      const total = correct + wrong;
      const acc = total > 0 ? Math.round(correct / total * 100) : null;
      const queue = Object.values(s.failedWords || {}).length;
      const color = p === 'jenn' ? 'var(--jenn)' : 'var(--jess)';
      const avatar = p === 'jenn' ? '🐥' : '🦊';
      const name = p.charAt(0).toUpperCase() + p.slice(1);
      const dayWrong = Object.values(s.failedWords || {})
        .filter(w => w.lastFailed === dKey)
        .sort((a, b) => b.failCount - a.failCount);
      const practiceInner = dayWrong.length > 0
        ? parentPracticeRowsHtml(dayWrong)
        : '<div class="empty-state" style="padding:8px;font-size:.75rem;">✅ No misses logged that day</div>';
      grid.innerHTML += '<div class="parent-player-card">'
        + '<div class="parent-player-title" style="color:' + color + ';">' + avatar + ' ' + name + '</div>'
        + '<div class="parent-stat-row"><span class="parent-stat-label">⭐ All-time star pts</span><span class="parent-stat-val">' + s.totalStars + '</span></div>'
        + '<div class="parent-stat-row"><span class="parent-stat-label">📅 Week star pts (so far)</span><span class="parent-stat-val" style="color:var(--gold);">' + s.weekStars + '</span></div>'
        + '<div class="parent-stat-row"><span class="parent-stat-label">☀️ Day star pts (' + dKey + ')</span><span class="parent-stat-val" style="color:var(--green);">' + dayStars + '</span></div>'
        + '<div class="parent-stat-row"><span class="parent-stat-label">✅ Correct / tries</span><span class="parent-stat-val">' + (total > 0 ? correct + ' / ' + total : '—') + '</span></div>'
        + '<div class="parent-stat-row"><span class="parent-stat-label">📊 Accuracy</span><span class="parent-stat-val">' + (acc !== null ? acc + '%' : '—') + '</span></div>'
        + '<div class="parent-stat-row"><span class="parent-stat-label">🎮 Game rounds</span><span class="parent-stat-val">' + rounds + '</span></div>'
        + '<div class="parent-stat-row"><span class="parent-stat-label">🏋️ My Words drill</span><span class="parent-stat-val">' + (drillDone ? '✅ Done' : '—') + '</span></div>'
        + '<div class="parent-stat-row"><span class="parent-stat-label">⏱ Active time</span><span class="parent-stat-val">' + timeStr + '</span></div>'
        + '<div class="parent-stat-row"><span class="parent-stat-label">💪 Queue (now)</span><span class="parent-stat-val">' + queue + '</span></div>'
        + '<div class="parent-practice-sub">'
        + '<div class="parent-practice-head" style="color:' + color + ';">🎯 Practice targets</div>'
        + practiceInner
        + '</div>'
        + '</div>';
    });
    return;
  }

  const isThisWeek = summaryWeekOffset === 0;
  const selectedWeekStart = weekStartForOffset(summaryWeekOffset);
  const weekLabel = isThisWeek ? 'This Week' : formatWeekRange(selectedWeekStart);

  if(nav){
    nav.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
      + '<button class="btn-secondary" onclick="navSummaryWeek(-1)" style="padding:6px 12px;font-size:.8rem;"' + (summaryWeekOffset <= -3 ? ' disabled' : '') + '>← Prev</button>'
      + '<div style="font-family:\'Fredoka One\',cursive;font-size:1rem;color:var(--gold);">' + weekLabel + '</div>'
      + '<button class="btn-secondary" onclick="navSummaryWeek(1)" style="padding:6px 12px;font-size:.8rem;"' + (isThisWeek ? ' disabled' : '') + '>Next →</button>'
      + '</div>';
  }

  ['jenn', 'jess'].forEach(p => {
    const s = state[p];
    let wkStars = 0, correct = 0, wrong = 0, rounds = 0, weekTimeMs = 0, weekDaysPlayed = 0, weekDrills = 0;

    if(isThisWeek){
      const roll = aggregateWeekFromDaily(s, selectedWeekStart);
      correct = roll.correct;
      wrong = roll.wrong;
      rounds = roll.rounds;
      weekTimeMs = roll.timeMs;
      weekDaysPlayed = roll.daysPlayed;
      weekDrills = roll.drillRounds;
      wkStars = Math.max(s.weekStars || 0, roll.stars || 0);
    } else {
      const hist = (s.weeklyHistory || []);
      const entry = hist.find(h => h && h.weekStart === selectedWeekStart);
      const roll = aggregateWeekFromDaily(s, selectedWeekStart);
      wkStars = Math.max(
        Number((entry && entry.stars) || 0),
        Number((entry && entry.snapshotStars) || 0),
        Number(roll.stars || 0)
      );
      correct = entry && entry.correct != null ? Number(entry.correct) : roll.correct;
      wrong = entry && entry.wrong != null ? Number(entry.wrong) : roll.wrong;
      rounds = entry && entry.rounds != null ? Number(entry.rounds) : roll.rounds;
      weekTimeMs = roll.timeMs;
      weekDaysPlayed = roll.daysPlayed;
      weekDrills = roll.drillRounds;
    }

    const weekTime = formatPlayTime(weekTimeMs, true) + (sessionFullTimeReveal ? '' : ' (cap 30m/day)');

    const total = correct + wrong;
    const acc = total > 0 ? Math.round(correct / total * 100) : null;
    const queue = Object.values(s.failedWords || {}).length;
    const color = p === 'jenn' ? 'var(--jenn)' : 'var(--jess)';
    const avatar = p === 'jenn' ? '🐥' : '🦊';
    const name = p.charAt(0).toUpperCase() + p.slice(1);

    const thisWeekWrong = isThisWeek ? Object.values(s.failedWords || {})
      .filter(w => w.lastFailed && w.lastFailed >= weekStart)
      .sort((a, b) => b.failCount - a.failCount) : [];
    let practiceBlock = '';
    if(isThisWeek){
      practiceBlock = '<div class="parent-practice-sub">'
        + '<div class="parent-practice-head" style="color:' + color + ';">🎯 Practice targets</div>'
        + (thisWeekWrong.length > 0 ? parentPracticeRowsHtml(thisWeekWrong) : '<div class="empty-state" style="padding:8px;font-size:.75rem;">✅ No missed words this week!</div>')
        + '</div>';
    } else {
      practiceBlock = '<div class="parent-practice-sub">'
        + '<div class="parent-practice-head" style="color:' + color + ';">🎯 Practice targets</div>'
        + '<div class="empty-state" style="padding:8px;font-size:.72rem;">Switch to <strong>Daily</strong> view to see words for a specific day.</div>'
        + '</div>';
    }

    grid.innerHTML += '<div class="parent-player-card">'
      + '<div class="parent-player-title" style="color:' + color + ';">' + avatar + ' ' + name + '</div>'
      + '<div class="parent-stat-row"><span class="parent-stat-label">⭐ All-time star pts</span><span class="parent-stat-val">' + s.totalStars + '</span></div>'
      + '<div class="parent-stat-row"><span class="parent-stat-label">📅 Weekly star pts (' + weekLabel + ')</span><span class="parent-stat-val" style="color:var(--gold);">' + wkStars + '</span></div>'
      + (isThisWeek
        ? '<div class="parent-stat-row"><span class="parent-stat-label">✅ Correct (week)</span><span class="parent-stat-val" style="color:var(--green);">' + (total > 0 ? correct + ' / ' + total : '—') + '</span></div>'
          + '<div class="parent-stat-row"><span class="parent-stat-label">📊 Accuracy (week)</span><span class="parent-stat-val">' + (acc !== null ? acc + '%' : '—') + '</span></div>'
          + '<div class="parent-stat-row"><span class="parent-stat-label">🎮 Rounds (week)</span><span class="parent-stat-val">' + rounds + '</span></div>'
          + '<div class="parent-stat-row"><span class="parent-stat-label">🏋️ Drill rounds (week)</span><span class="parent-stat-val">' + weekDrills + '</span></div>'
          + '<div class="parent-stat-row"><span class="parent-stat-label">⏱ Time this week</span><span class="parent-stat-val">' + weekTime + '</span></div>'
          + '<div class="parent-stat-row"><span class="parent-stat-label">📆 Days played (week)</span><span class="parent-stat-val">' + weekDaysPlayed + ' / 7</span></div>'
          + '<div class="parent-stat-row"><span class="parent-stat-label">🔥 Streak</span><span class="parent-stat-val">' + s.streak + ' days</span></div>'
          + '<div class="parent-stat-row"><span class="parent-stat-label">💪 Queue</span><span class="parent-stat-val">' + queue + ' words</span></div>'
        : '<div class="parent-stat-row"><span class="parent-stat-label">✅ Correct (saved week)</span><span class="parent-stat-val">' + (total > 0 ? correct + ' / ' + total : '—') + '</span></div>'
          + '<div class="parent-stat-row"><span class="parent-stat-label">📊 Accuracy</span><span class="parent-stat-val">' + (acc !== null ? acc + '%' : '—') + '</span></div>'
          + '<div class="parent-stat-row"><span class="parent-stat-label">🎮 Rounds</span><span class="parent-stat-val">' + rounds + '</span></div>'
          + '<div class="parent-stat-row"><span class="parent-stat-label">🏋️ Drill rounds</span><span class="parent-stat-val">' + weekDrills + '</span></div>'
          + '<div class="parent-stat-row"><span class="parent-stat-label">⏱ Time played</span><span class="parent-stat-val">' + weekTime + '</span></div>'
          + '<div class="parent-stat-row"><span class="parent-stat-label">📆 Days played</span><span class="parent-stat-val">' + weekDaysPlayed + ' / 7</span></div>')
      + practiceBlock
      + '</div>';
  });
}

// ════════════════════════════════════════════════
// PARENT CONTROLS — PASSWORD + CLEAR (#1)
// ════════════════════════════════════════════════
const PARENT_PASSWORD = '1234'; // ← change this to your preferred password

function revealFullPlayTime(){
  const input = document.getElementById('parent-pwd');
  const msg = document.getElementById('pwd-msg');
  if((input?.value||'').trim() !== PARENT_PASSWORD){
    if(msg){ msg.textContent = '❌ Enter parent password first'; msg.style.color = 'var(--jenn)'; }
    return;
  }
  sessionFullTimeReveal = true;
  if(msg){ msg.textContent = '✅ Exact French times shown this session (hub + parent cards).'; msg.style.color = 'var(--green)'; }
  renderParentSummary();
  updateLeaderboard();
  if(currentPlayer) updateHub();
}

async function reopenGradeForParent(grade){
  const input = document.getElementById('parent-pwd');
  const msg = document.getElementById('pwd-msg');
  if((input?.value||'').trim() !== PARENT_PASSWORD){
    if(msg){ msg.textContent = '❌ Wrong password'; msg.style.color = 'var(--jenn)'; }
    return;
  }
  ['jenn','jess'].forEach(p=>{
    if(!state[p].gradeParentOpen) state[p].gradeParentOpen = defaultGradeParentOpen();
    state[p].gradeParentOpen[grade] = true;
  });
  await saveState('jenn');
  await saveState('jess');
  if(msg){ msg.textContent = '✅ G'+grade+' reopened'; msg.style.color = 'var(--green)'; }
  renderParentGradeReopenControls();
  if(currentPlayer){
    refreshGradeTabs();
    updateHub();
  }
}

function unlockWeekdaySession(){
  const input = document.getElementById('weekday-lock-pwd');
  const err = document.getElementById('weekday-lock-error');
  if((input?.value||'') !== PARENT_PASSWORD){
    if(err) err.textContent = '❌ Wrong password';
    setTimeout(()=>{ if(err) err.textContent = ''; }, 2000);
    return;
  }
  if(input) input.value = '';
  if(err) err.textContent = '';
  document.getElementById('weekday-lock-overlay').classList.remove('show');
  sessionWeekdayBypass = true;
  if(pendingPlayer){
    const q = pendingPlayer;
    pendingPlayer = null;
    selectPlayer(q);
  }
}

function cancelWeekdayLock(){
  pendingPlayer = null;
  document.getElementById('weekday-lock-overlay').classList.remove('show');
  const e = document.getElementById('weekday-lock-error');
  if(e) e.textContent = '';
  const i = document.getElementById('weekday-lock-pwd');
  if(i) i.value = '';
}

function setRecoveryMsg(text, ok){
  const el=document.getElementById('recovery-msg');
  if(!el)return;
  el.textContent=text||'';
  el.style.color=ok?'var(--green)':'var(--text-muted)';
}

// ════════════════════════════════════════════════
// DAILY AUTO-BACKUP
// ════════════════════════════════════════════════
const BACKUP_DONE_KEY = 'french_backup_done_';

function triggerDailyBackup(player){
  // Only once per player per day, only if we have real progress
  if(!window.fbBackupSave) return;
  const dateKey = todayKey();
  const doneKey = BACKUP_DONE_KEY + player + '_' + dateKey;
  if(localStorage.getItem(doneKey)) return;
  const s = state[player];
  if(!s || !s.totalStars) return;
  window.fbBackupSave(player, JSON.parse(JSON.stringify(s)));
  localStorage.setItem(doneKey, '1');
}

async function renderBackupRestoreUI(){
  if(!ensureParentPassword()){
    setRecoveryMsg('❌ Enter parent password first');
    return;
  }
  const el = document.getElementById('backup-restore-panel');
  if(!el) return;
  el.style.display = 'block';
  el.innerHTML = '<div style="font-size:.72rem;color:var(--text-muted);text-align:center;">Loading backups…</div>';
  if(!window.fbBackupList){
    el.innerHTML = '<div style="font-size:.72rem;color:var(--jenn);">Backup not available offline.</div>';
    return;
  }
  const [jennBackups, jessBackups] = await Promise.all([
    window.fbBackupList('jenn'),
    window.fbBackupList('jess')
  ]);
  function makeRows(player, backups, color){
    if(!backups.length) return `<div style="font-size:.72rem;color:var(--text-muted);margin-bottom:8px;">${player}: no backups yet</div>`;
    return backups.map(b =>
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
        <span style="font-size:.72rem;color:${color};font-weight:800;width:72px;">${b.backedUpAt}</span>
        <span style="font-size:.68rem;color:var(--text-muted);flex:1;">⭐${b.totalStars||0} · 🔥${b.streak||0} · played ${Object.keys(b.playedDays||{}).length}d</span>
        <button data-action="restore-backup" data-player="${escapeAttr(player)}" data-backup-id="${escapeAttr(b.id)}" style="background:rgba(16,185,129,.15);border:2px solid var(--green);border-radius:8px;padding:3px 9px;font-size:.65rem;font-weight:800;color:var(--green);cursor:pointer;touch-action:manipulation;">Restore</button>
      </div>`
    ).join('');
  }
  el.innerHTML =
    `<div style="font-size:.72rem;font-weight:800;color:var(--jenn);margin-bottom:4px;">🐥 Jenn</div>`
    + makeRows('jenn', jennBackups, 'var(--jenn)')
    + `<div style="font-size:.72rem;font-weight:800;color:var(--jess);margin:8px 0 4px;">🦊 Jess</div>`
    + makeRows('jess', jessBackups, 'var(--jess)');
}

async function restoreFromBackup(player, docId){
  if(!ensureParentPassword()){
    setRecoveryMsg('❌ Enter parent password first');
    return;
  }
  if(!window.confirm(`Restore ${player}'s profile from backup ${docId}?\nThis will overwrite their current data.`)) return;
  setRecoveryMsg('Restoring…');
  try{
    const backups = await window.fbBackupList(player);
    const entry = backups.find(b => b.id === docId);
    if(!entry){ setRecoveryMsg('❌ Backup not found'); return; }
    // Strip backup metadata fields before restoring
    const { id, backedUpAt, ...restoredData } = entry;
    restoredData.lastUpdatedAt = Date.now();
    state[player] = Object.assign({}, DEFAULT_STATE(), restoredData);
    await saveState(player, {suppressEcho: true});
    updateLeaderboard();
    if(currentPlayer === player) updateHub();
    renderParentSummary();
    setRecoveryMsg(`✅ ${player} restored from ${backedUpAt}`, true);
    renderBackupRestoreUI();
  }catch(e){
    console.warn('restore err', e);
    setRecoveryMsg('❌ Restore failed');
  }
}
function ensureParentPassword(){
  const entered=(document.getElementById('parent-pwd')?.value||'').trim();
  return entered===PARENT_PASSWORD;
}
function toggleRecoveryFreeze(){
  if(!ensureParentPassword()){
    setRecoveryMsg('❌ Enter parent password first');
    return;
  }
  recoveryWriteFreeze=!recoveryWriteFreeze;
  setRecoveryMsg(recoveryWriteFreeze?'✅ Recovery mode ON — cloud writes paused':'✅ Recovery mode OFF — cloud writes resumed', true);
}
function exportRecoveryBackup(){
  if(!ensureParentPassword()){
    setRecoveryMsg('❌ Enter parent password first');
    return;
  }
  const payload={
    exportedAt:new Date().toISOString(),
    weekStart:getWeekStart(),
    recoveryWriteFreeze,
    players:{
      jenn:JSON.parse(JSON.stringify(state.jenn)),
      jess:JSON.parse(JSON.stringify(state.jess))
    }
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='french-adventure-backup-'+stamp+'.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  setRecoveryMsg('✅ Backup exported', true);
}
function promptRecoveryImport(){
  if(!ensureParentPassword()){
    setRecoveryMsg('❌ Enter parent password first');
    return;
  }
  document.getElementById('recovery-import-file')?.click();
}
function getIsoDateRange(startKey,endKey){
  if(!startKey||!endKey)return [];
  const out=[];
  const s=new Date(startKey+'T00:00:00');
  const e=new Date(endKey+'T00:00:00');
  for(let d=new Date(s);d<=e;d.setDate(d.getDate()+1)){
    out.push(d.toISOString().slice(0,10));
  }
  return out;
}
function previousWeekStartKey(baseWeekStart){
  const d=new Date((baseWeekStart||getWeekStart())+'T00:00:00');
  d.setDate(d.getDate()-7);
  return d.toISOString().slice(0,10);
}
function weekStartForOffset(offset){
  const d=new Date(getWeekStart()+'T00:00:00');
  d.setDate(d.getDate()+offset*7);
  return d.toISOString().slice(0,10);
}
function weekEndFromStart(startKey){
  const d=new Date(startKey+'T00:00:00');
  d.setDate(d.getDate()+6);
  return d.toISOString().slice(0,10);
}
function formatWeekRange(startKey){
  const s=new Date(startKey+'T00:00:00');
  const e=new Date(weekEndFromStart(startKey)+'T00:00:00');
  const mon=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return mon[s.getMonth()]+' '+s.getDate()+' - '+mon[e.getMonth()]+' '+e.getDate();
}
function aggregateWeekFromDaily(s, weekStart){
  const end=weekEndFromStart(weekStart);
  const keys=getIsoDateRange(weekStart,end);
  let stars=0,correct=0,wrong=0,rounds=0,timeMs=0,daysPlayed=0,drillRounds=0;
  keys.forEach(k=>{
    const ts=s.todayStats&&s.todayStats[k];
    if(ts){
      stars+=Number(ts.stars||0);
      correct+=Number(ts.correct||0);
      wrong+=Number(ts.wrong||0);
      rounds+=Number(ts.rounds||0);
      drillRounds+=ts.drillDone?1:0;
      if((Number(ts.correct||0)+Number(ts.wrong||0))>0) daysPlayed++;
    }else if(s.playedDays&&s.playedDays[k]){
      daysPlayed++;
    }
    timeMs+=Number((s.dailyTimeMs&&s.dailyTimeMs[k])||0);
  });
  return {stars,correct,wrong,rounds,timeMs,daysPlayed,drillRounds};
}
function reconcilePlayerFromBackup(player, data){
  if(!data||!data.players||!data.players[player])return null;
  const incoming=data.players[player];
  const merged=JSON.parse(JSON.stringify(state[player]));
  const jToday=Object.assign({}, merged.todayStats||{}, incoming.todayStats||{});
  const jPlayed=Object.assign({}, merged.playedDays||{}, incoming.playedDays||{});
  merged.todayStats=jToday;
  merged.playedDays=jPlayed;
  merged.dailyTimeMs=Object.assign({}, merged.dailyTimeMs||{}, incoming.dailyTimeMs||{});
  merged.dailyRounds=Object.assign({}, merged.dailyRounds||{}, incoming.dailyRounds||{});
  merged.gradeStats=Object.assign({}, merged.gradeStats||{}, incoming.gradeStats||{});
  merged.totalStars=Math.max(Number(merged.totalStars||0), Number(incoming.totalStars||0));
  merged.weekStars=Math.max(Number(merged.weekStars||0), Number(incoming.weekStars||0));
  merged.streak=Math.max(Number(merged.streak||0), Number(incoming.streak||0));
  if(incoming.weeklyHistory&&incoming.weeklyHistory.length){
    const byWeek={};
    [...(merged.weeklyHistory||[]), ...incoming.weeklyHistory].forEach(w=>{
      if(w&&w.weekStart)byWeek[w.weekStart]=w;
    });
    merged.weeklyHistory=Object.values(byWeek).sort((a,b)=>String(a.weekStart).localeCompare(String(b.weekStart))).slice(-8);
  }
  merged.weekStart = merged.weekStart || getWeekStart();
  const prevStart=previousWeekStartKey(getWeekStart());
  const already=(merged.weeklyHistory||[]).some(w=>w.weekStart===prevStart);
  if(!already){
    const rollup=aggregateWeekFromDaily(merged,prevStart);
    if(rollup.stars>0||rollup.correct>0||rollup.wrong>0||rollup.rounds>0){
      merged.weeklyHistory=(merged.weeklyHistory||[]).concat([{
        weekStart:prevStart,
        stars:rollup.stars,
        correct:rollup.correct,
        wrong:rollup.wrong,
        rounds:rollup.rounds,
        snapshotStars:rollup.stars,
        savedAt:todayKey()
      }]).slice(-8);
    }
  }
  merged.lastUpdatedAt=Date.now();
  return merged;
}
async function handleRecoveryImport(evt){
  try{
    if(!ensureParentPassword()){
      setRecoveryMsg('❌ Enter parent password first');
      return;
    }
    const file=evt?.target?.files?.[0];
    if(!file){
      setRecoveryMsg('No file selected');
      return;
    }
    const text=await file.text();
    const data=JSON.parse(text);
    const reconciledJenn=reconcilePlayerFromBackup('jenn', data);
    const reconciledJess=reconcilePlayerFromBackup('jess', data);
    if(!reconciledJenn && !reconciledJess){
      setRecoveryMsg('❌ Invalid backup JSON');
      return;
    }
    if(reconciledJenn) state.jenn=reconciledJenn;
    if(reconciledJess) state.jess=reconciledJess;
    renderParentSummary();
    updateLeaderboard();
    if(currentPlayer==='jenn' || currentPlayer==='jess') updateHub();
    if(reconciledJenn) await saveState('jenn');
    if(reconciledJess) await saveState('jess');
    if(reconciledJenn && reconciledJess){
      setRecoveryMsg('✅ Jenn + Jess recovery merged and saved', true);
    }else if(reconciledJenn){
      setRecoveryMsg('✅ Jenn recovery merged and saved', true);
    }else{
      setRecoveryMsg('✅ Jess recovery merged and saved', true);
    }
  }catch(e){
    console.warn('Recovery import failed', e);
    setRecoveryMsg('❌ Recovery import failed');
  }finally{
    if(evt?.target)evt.target.value='';
  }
}

async function clearProgress(mode){
  const input = document.getElementById('parent-pwd');
  const msg = document.getElementById('pwd-msg');
  const entered = (input?.value||'').trim();

  if(entered !== PARENT_PASSWORD){
    msg.textContent = '❌ Wrong password';
    msg.style.color = 'var(--jenn)';
    setTimeout(()=>{ msg.textContent=''; }, 2000);
    return;
  }

  const today = todayKey();

  if(mode === 'today'){
    // Clear today's stats, round counts, topic stars, today's failed words
    ['jenn','jess'].forEach(p=>{
      const s = state[p];
      if(s.dailyRounds){
        Object.keys(s.dailyRounds).forEach(k=>{
          if(k.startsWith(today)) delete s.dailyRounds[k];
        });
      }
      if(s.todayStats) delete s.todayStats[today];
      if(s.dailyTimeMs && s.dailyTimeMs[today]) delete s.dailyTimeMs[today];
      if(s.lastDrillComplete===today) s.lastDrillComplete=null;
      if(s.failedWords){
        Object.keys(s.failedWords).forEach(k=>{
          if(s.failedWords[k].lastFailed===today) delete s.failedWords[k];
        });
      }
      if(s.playedDays) delete s.playedDays[today];
      // Clear topic stars — per-day use
      s.topicStars = {};
      if(s.gradeStats && s.gradeStats[today]) delete s.gradeStats[today];
      if(s.gradeGameRounds && s.gradeGameRounds[today]) delete s.gradeGameRounds[today];
      if(s.dailyTopicStats && s.dailyTopicStats[today]) delete s.dailyTopicStats[today];
    });
    msg.textContent = '✅ Today cleared for both players';
    msg.style.color = 'var(--green)';

  } else if(mode === 'prev'){
    const confirmPrev = window.confirm('Clear old days and reset week stars/streak for both players?');
    if(!confirmPrev){ msg.textContent=''; return; }
    // Clear previous days' data + week stars + streak
    ['jenn','jess'].forEach(p=>{
      const s = state[p];
      // Remove previous days' failed words (keep today's)
      if(s.failedWords){
        Object.keys(s.failedWords).forEach(k=>{
          if(s.failedWords[k].lastFailed && s.failedWords[k].lastFailed !== today){
            delete s.failedWords[k];
          }
        });
      }
      // Clear old daily stats (keep today)
      if(s.todayStats){
        Object.keys(s.todayStats).forEach(k=>{
          if(k !== today) delete s.todayStats[k];
        });
      }
      if(s.gradeGameRounds){
        Object.keys(s.gradeGameRounds).forEach(k=>{
          if(k !== today) delete s.gradeGameRounds[k];
        });
      }
      if(s.dailyTopicStats){
        Object.keys(s.dailyTopicStats).forEach(k=>{
          if(k !== today) delete s.dailyTopicStats[k];
        });
      }
      // Clear old played days (keep today)
      if(s.playedDays){
        Object.keys(s.playedDays).forEach(k=>{
          if(k !== today) delete s.playedDays[k];
        });
      }
      // Clear week stars, streak, weekly history
      s.weekStars = 0;
      s.weekStart = getWeekStart();
      s.streak = 0;
      s.weeklyHistory = [];
    });
    msg.textContent = '✅ Previous days cleared — week stars & streak reset';
    msg.style.color = 'var(--green)';

  } else if(mode === 'all'){
    // Full reset — wipe everything, fresh start
    const confirmed = window.confirm('⚠️ This will erase ALL progress for BOTH players — total stars, streaks, all history. Cannot be undone. Continue?');
    if(!confirmed){ msg.textContent=''; return; }
    ['jenn','jess'].forEach(p=>{
      state[p] = DEFAULT_STATE();
    });
    msg.textContent = '✅ Full reset complete — fresh start!';
    msg.style.color = 'var(--green)';
  }

  ['jenn','jess'].forEach(function(pl){ clearAllRoundDraftsForPlayer(pl); });
  // Save both players — suppress echo so the cleared state sticks in UI
  await saveState('jenn', {suppressEcho: true});
  await saveState('jess', {suppressEcho: true});

  if(input) input.value = '';
  setTimeout(()=>{ msg.textContent=''; }, 3000);

  // Refresh all UI — after saves resolve so echo suppression is armed
  renderParentSummary();
  updateLeaderboard();
  if(currentPlayer) updateHub();
}

// Wall clock — always running on select screen
function startWallClock(){
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function tick(){
    const now=new Date();
    let h=now.getHours(),m=now.getMinutes();
    const ampm=h>=12?'PM':'AM';
    h=h%12||12;
    document.getElementById('wall-clock-time').textContent=h+':'+(m<10?'0':'')+m+' '+ampm;
    document.getElementById('wall-clock-date').textContent=days[now.getDay()]+', '+months[now.getMonth()]+' '+now.getDate();
  }
  tick();
  setInterval(tick,1000);
}

hydrateStateFromLocalMirror();
initConnectivityAndSyncUI();
showScreen('select');
startWallClock();

Object.assign(window, {
  selectPlayer, goBack, exitGame, setGrade,
  showMyWords, showMyWordsTab, showStudy, showStudySet,
  showParentSummary, navSummaryWeek, navDailySummary, setSummaryMode,
  toggleHubDailySummary, toggleSloganTranslation,
  toggleWeekday, revealFullPlayTime, reopenGradeForParent, unlockWeekdaySession, cancelWeekdayLock,
  refreshGradeTabs,
  startGame, nextQuestion, showHint,
  speakCurrent, startSpeech, speakFrench, closeOverlay,
  clearScramble, checkScramble, clearBuilder, checkBuilder,
  removeBuilt, handleQuizAnswer, handleMatchClick,
  checkDrill, revealDrill, renderDrillCard,
  checkListenAnswer, startListenSpeech,
  speakAndReveal, clearProgress, unlockApp, lockApp,
  renderBackupRestoreUI, restoreFromBackup,
  exportRecoveryBackup, promptRecoveryImport, handleRecoveryImport, toggleRecoveryFreeze
});

