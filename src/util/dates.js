// Date and week helpers.
//
// Every function here returns a YYYY-MM-DD key. Three different conventions
// were in use before this file existed — device-local calendar, UTC slicing,
// and a local-midnight-to-UTC round trip — which is why two devices could
// disagree about what "today" is. Unifying them is a follow-up commit; this
// file is a faithful move of the existing behaviour.

export function getWeekStart(){
  const d=new Date();
  d.setHours(0,0,0,0);
  const day=d.getDay(); // 0=Sun,1=Mon,...6=Sat
  d.setDate(d.getDate()-(day===0?6:day-1)); // roll back to Monday
  // Return local date string to avoid UTC shift
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

export function isSameWeek(ts){
  if(!ts) return true; // null/missing = treat as current week, never auto-wipe
  return ts >= getWeekStart();
}

export function todayKey(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

export function dateKeyAddDays(delta){
  const d=new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate()+delta);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

export function getIsoDateRange(startKey,endKey){
  if(!startKey||!endKey)return [];
  const out=[];
  const s=new Date(startKey+'T00:00:00');
  const e=new Date(endKey+'T00:00:00');
  for(let d=new Date(s);d<=e;d.setDate(d.getDate()+1)){
    out.push(d.toISOString().slice(0,10));
  }
  return out;
}

export function previousWeekStartKey(baseWeekStart){
  const d=new Date((baseWeekStart||getWeekStart())+'T00:00:00');
  d.setDate(d.getDate()-7);
  return d.toISOString().slice(0,10);
}

export function weekStartForOffset(offset){
  const d=new Date(getWeekStart()+'T00:00:00');
  d.setDate(d.getDate()+offset*7);
  return d.toISOString().slice(0,10);
}

export function weekEndFromStart(startKey){
  const d=new Date(startKey+'T00:00:00');
  d.setDate(d.getDate()+6);
  return d.toISOString().slice(0,10);
}

export function formatWeekRange(startKey){
  const s=new Date(startKey+'T00:00:00');
  const e=new Date(weekEndFromStart(startKey)+'T00:00:00');
  const mon=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return mon[s.getMonth()]+' '+s.getDate()+' - '+mon[e.getMonth()]+' '+e.getDate();
}
