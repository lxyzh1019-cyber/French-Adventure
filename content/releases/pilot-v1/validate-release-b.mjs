import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const dir=resolve(process.argv[2]||'.');
const read=f=>JSON.parse(readFileSync(join(dir,f),'utf8'));
const manifest=read('manifest.json');
const chapters=read('chapters.json');
const learning=read('learning_items.json');
const reviews=read('review_items.json');
const skills=read('skills.json');
const pron=read('pronunciation_tasks.json');
const history=read('history_sources.json');
const fixtures=read('learning_fixtures.json');
const mapping=read('curriculum_map.json');
const all=[...learning.items,...reviews.items];
let checks=0;
const check=(condition,why)=>{assert.ok(condition,why);checks++;};
const norm=s=>s.normalize('NFC').replace(/[’‘]/g,"'").replace(/[.。!?]+$/,'').trim().replace(/\s+/g,' ').toLowerCase();
const itemMap=new Map(all.map(x=>[x.id,x]));
const skillMap=new Map(skills.skills.map(x=>[x.id,x]));
const outcomeIds=new Set(mapping.outcomes.map(x=>x.id));
const sourceIds=new Set(history.sources.map(x=>x.id));
const taskIds=new Set(pron.tasks.map(x=>x.id));
check(chapters.chapters.length===4,'four chapters required');
check(itemMap.size===all.length,'duplicate item IDs');
check(skills.skills.filter(s=>s.id.startsWith('C')).length===8,'eight narrow target skills required');
check(pron.tasks.length===12,'one pronunciation task per core session');
check(chapters.chapters.reduce((n,c)=>n+c.sessions.length,0)===12,'twelve core sessions');
for(const file of manifest.files){check(existsSync(join(dir,file.path)),`missing file ${file.path}`);check(createHash('sha256').update(readFileSync(join(dir,file.path))).digest('hex')===file.sha256,`hash mismatch ${file.path}`);}
for(const [k,v] of Object.entries({chapters:chapters.chapters.length,learning_items:learning.items.length,review_items:reviews.items.length,skills:skills.skills.length}))check(manifest.counts[k]===v,`count mismatch ${k}`);
for(const item of all){
 check([1,2].includes(item.version),`version ${item.id}`);
 check(!!item.zh,`missing Chinese support ${item.id}`);
 check(item.skillIds.every(x=>skillMap.has(x)),`unmapped skill ${item.id}`);
 check(item.curriculum_outcome_ids.every(x=>outcomeIds.has(x)),`unmapped outcome ${item.id}`);
 check(!!item.exposure_signature,`missing exposure signature ${item.id}`);
 if(item.type==='choice'||item.type==='encoding_choice'){
  check(new Set(item.choices.map(x=>x.id)).size===item.choices.length,`duplicate choices ${item.id}`);
  check(item.accepted.every(x=>item.choices.some(c=>c.id===x)),`unreachable key ${item.id}`);
  check(item.accepted.length===1,`ambiguous keyed choice ${item.id}`);
  check(!!item.feedback.incorrect_en&&!!item.feedback.incorrect_zh,`missing corrective teaching ${item.id}`);
 }
 if(item.domain==='listening'){
  check(!!item.audio.script_fr_ca,`missing listening script ${item.id}`);
  check(item.stimulus_visibility==='audio_only_until_submit',`transcript leak policy ${item.id}`);
  check(item.replay_cap===2,`listening replay rule ${item.id}`);
  check(item.technical_failure.result==='invalid',`silent audio scoring ${item.id}`);
 }
 if(item.type==='typed_bounded')check(item.scoring.unknown_answer_result==='awaiting_review'&&!item.scoring.unknown_answer_is_wrong,`finite key false rejection ${item.id}`);
 if(item.phase==='independent_exit'||item.phase==='delayed'||item.phase==='transfer')check(item.support_level===0,`non-independent check ${item.id}`);
 if(item.phase==='retry')check(item.fresh_evidence_eligible===false&&item.support_level>0,`retry counted fresh ${item.id}`);
 for(const field of ['retry_item_id','teaching_item_id'])if(item[field])check(itemMap.has(item[field]),`broken ${field}: ${item.id}`);
}
const teachingModels=learning.items.filter(x=>x.phase==='teaching').map(x=>norm(x.model_fr));
for(const item of reviews.items){
 check(!learning.items.some(x=>x.id===item.id),`review ID reused ${item.id}`);
 if(item.type==='typed_bounded')check(!teachingModels.includes(norm(item.accepted[0])),`delayed/transfer repeats exact teaching model ${item.id}`);
}
for(const c of chapters.chapters){
 check(c.new_words_or_chunks.length>=4&&c.new_words_or_chunks.length<=6,`chunk scope ${c.chapter_id}`);
 check(c.scenes.length===3&&c.session_bookmarks.length===3,`scene/bookmark count ${c.chapter_id}`);
 for(const scene of c.scenes){
  check(scene.lines_fr.length>=4&&scene.lines_fr.length<=8,`scene length ${scene.id}`);
  check(scene.lines_fr.length===scene.lines_en.length&&scene.lines_fr.length===scene.lines_zh.length,`translation line count ${scene.id}`);
  check(existsSync(join(dir,scene.illustration_asset)),`asset missing ${scene.id}`);
  check(scene.audio_before_text&&scene.source_status.includes('fictional'),`scene separation ${scene.id}`);
 }
 for(const s of c.sessions){
  check(s.steps.reduce((n,x)=>n+x.minutes,0)===20,`session time ${s.id}`);
  check(s.required_item_ids.every(id=>itemMap.has(id)),`session item references ${s.id}`);
  check(s.checkpoint.advance_on.includes('not score threshold'),`core story locked by score ${s.id}`);
  check(s.steps.filter(x=>x.task_id).every(x=>taskIds.has(x.task_id)),`pron reference ${s.id}`);
  for(const step of s.steps){for(const id of step.item_ids||step.candidate_item_ids||[])check(itemMap.has(id),`broken step reference ${s.id} ${id}`);}
  const t=itemMap.get(`${s.id}-CHECK-P`);
  const earlierModels=s.steps.slice(0,-1).flatMap(step=>step.item_ids||[]).map(id=>itemMap.get(id)).filter(i=>i.model_fr||i.accepted&&i.type==='typed_bounded').flatMap(i=>i.model_fr?[norm(i.model_fr)]:i.accepted.map(norm));
  check(!earlierModels.includes(norm(t.accepted[0])),`exit reproduces same session teaching/guided key ${t.id}`);
 }
 for(const h of c.real_history_card_ids)check(chapters.history_cards.some(x=>x.id===h),`history card missing ${c.chapter_id}`);
}
for(const h of chapters.history_cards){check(h.claimIds.every(id=>sourceIds.has(id)),`history source ${h.id}`);check(h.record_as==='cultural_understanding_only',`history proficiency conflation ${h.id}`);check(!!h.en&&!!h.zh&&!!h.fr,`history language ${h.id}`);}
for(const s of skills.skills.filter(s=>s.evidence_role!=='curriculum_link_only')){
 for(const field of ['teaching_item_ids','guided_item_ids','independent_item_ids','delayed_item_ids','transfer_item_ids']){
  check(s[field].length>0,`target lacks ${field}: ${s.id}`);
  check(s[field].every(id=>itemMap.has(id)),`target link ${s.id}`);
 }
 check(s.independent_item_ids.length>=3&&s.delayed_item_ids.length>=2&&s.transfer_item_ids.length>=1,`minimum target coverage ${s.id}`);
 check(s.prerequisites.every(id=>skillMap.has(id)),`prerequisite missing ${s.id}`);
}

// Executable reference expectations, not the app's production reducer.
function expectedState(history,target='C1.LOCATE'){
 const seen=new Set(), immediate=[],late=[];
 let state='New';
 for(const e of history){
  if(e.skill_id!==target||seen.has(e.evidence_id))continue;
  seen.add(e.evidence_id);
  if(['history','pronunciation'].includes(e.phase)||e.technical_invalid||e.result==='invalid')continue;
  if(state==='New')state='Learning';
  if(e.support_level>0||e.exposed_before||e.result==='awaiting_review')continue;
  if(e.phase==='independent_exit'){
   immediate.push(e);
   if(state!=='Remembered'&&state!=='Transfer shown'){
    state=immediate.length>=3&&immediate.filter(x=>x.result==='correct').length/immediate.length>=0.8?'Ready to check':'Practising';
   }
  }
  if(e.hours_since_teaching>=48&&['delayed','transfer'].includes(e.phase)){
   if(e.result==='incorrect'){state='Needs review';late.length=0;continue;}
   if(e.phase==='delayed'&&state==='Ready to check'){
    late.push(e);
    if(late.length>=2&&late.every(x=>x.result==='correct'))state='Remembered';
   }
   if(e.phase==='transfer'&&state==='Remembered'&&e.result==='correct')state='Transfer shown';
  }
 }
 return state;
}
for(const f of fixtures.fixtures)check(expectedState(f.history,f.target_skill||'C1.LOCATE')===f.expected_state,`reference fixture ${f.id}`);
function boundedScore(i,response){
 if(i.type==='encoding_choice')return i.accepted.includes(response)?'correct':'incorrect';
 if(i.accepted.some(x=>norm(x)===norm(response)))return 'correct';
 if(i.type==='encoding_typed')return 'encoding_needs_practice';
 const accentless=s=>norm(s).normalize('NFD').replace(/\p{M}/gu,'').normalize('NFC');
 if(i.scoring?.meaning_policy&&i.accepted.some(x=>accentless(x)===accentless(response)))return 'meaning_correct_spelling_needs_correction';
 return 'awaiting_review';
}
for(const f of fixtures.scoring_cases){const i=itemMap.get(f.item_id);const score=boundedScore(i,f.response);if(f.expected)check(score===f.expected,`bounded scoring fixture ${f.id}`);if(f.expected_independent!==undefined)check((f.support_level===0)===f.expected_independent,`support fixture ${f.id}`);}
for(const f of fixtures.scheduler_cases)check((Date.parse(f.session)-Date.parse(f.taught)>=48*3600000)===f.expected_due,`scheduler fixture ${f.id}`);

if(manifest.version==='1.1.0'){
 check(manifest.compatible_master_plan_revision===5,'governing revision');
 for(const i of all){
  check(i.release_id===manifest.release_id,`item release identity ${i.id}`);
  check(!!i.support_variants?.more&&!!i.support_variants?.less,`explicit support variants ${i.id}`);
  check(i.support_variants.more.support_level>0&&i.support_variants.less.support_level>0,`support variant attribution ${i.id}`);
  check(i.related_assessment_skill_ids.every(x=>skillMap.has(x)),`canonical link ${i.id}`);
  if(i.audio)check(i.audio.rate===0.80,`TTS rate ${i.id}`);
  if(i.type==='typed_bounded'&&['independent_exit','delayed','delayed_reserve','transfer'].includes(i.phase)){
   check(!!i.stimulus_fr,`French production clue ${i.id}`);
   check(!/Write:|Write in French:|Write one French sentence:/.test(i.prompt),`translation production task ${i.id}`);
   check(i.scoring.encoding_credit_from_this_item===false,`meaning incorrectly credits encoding ${i.id}`);
   check(i.scoring.evidence_results.meaning_correct_spelling_needs_correction.pattern_result==='correct'&&i.scoring.evidence_results.meaning_correct_spelling_needs_correction.encoding_mastery_credit===false,`meaning evidence scope ${i.id}`);
   check(i.unlisted_response_path.blocks_progress===false,`reviewer blocks core ${i.id}`);
  }
  if(i.type==='sentence_build')check(i.word_tiles.length>1&&i.mastery_credit===false,`assembly evidence ${i.id}`);
  if(i.type==='encoding_choice')check(i.scoring.meaning_credit===false,`encoding meaning conflation ${i.id}`);
 }
 for(const c of chapters.chapters){
  check(c.encoding_focus.skill_id==='W_ENCODING',`encoding target ${c.chapter_id}`);
  for(const s of c.sessions){
   check(itemMap.get(s.id+'-RECOGNIZE')?.type==='choice',`recognition route ${s.id}`);
   check(itemMap.get(s.id+'-ASSEMBLE')?.type==='sentence_build',`assembly route ${s.id}`);
   check(itemMap.get(s.id+'-GUIDED-P')?.type==='frame_completion',`completion route ${s.id}`);
  }
 }
 for(const t of pron.tasks)check(t.model_rate===0.80&&t.scoring.includes('no numeric score'),`pronunciation contract ${t.id}`);
 const a=fixtures.baseline_cases.find(x=>x.id==='BASE-A'),b=fixtures.baseline_cases.find(x=>x.id==='BASE-B');
 check(a.expected.story_start===b.expected.story_start,'baseline shared plot');
 check(a.expected.listening_support==='less'&&b.expected.listening_support==='more','baseline listening routing');
 check(a.expected.grammar_support==='more'&&b.expected.grammar_support==='more','baseline grammar routing');
 check(fixtures.fixtures.some(f=>f.id==='F21-guided-right-independent-wrong'),'guided independent regression fixture');
}

const report={release_id:manifest.release_id,status:'passed',checks,reference_state_fixtures:fixtures.fixtures.length,scoring_cases:fixtures.scoring_cases.length,scheduler_cases:fixtures.scheduler_cases.length,scope:'JSON parse, references, counts, hashes, exposure policies, teaching/check separation, required coverage, reference-rule oracle. Not app execution or educational validation.',limitations:manifest.limitations};
writeFileSync(join(dir,'validation_report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
