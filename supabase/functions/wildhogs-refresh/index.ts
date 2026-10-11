import { createClient } from 'npm:@supabase/supabase-js@2';
const TEAM = 1425498;
const LEGACY: Record<number,string> = {4924922:'sandy',9295884:'pradeep',8904457:'kishore-s',4924948:'kishore',3501467:'sathishkumar',14156142:'makesh',8904437:'sajjath',4924954:'sathya'};
const delay = () => new Promise(r=>setTimeout(r,3000));
function legal(overs: number|string) { const p=String(overs).split('.'); const b=+(p[1]||0); if(b>5)throw Error('Invalid cricket overs'); return +p[0]*6+b; }
async function readAPI(path:string) {
 if(!path.startsWith('/api/v1/'))throw Error('Path outside robots allowance');
 await delay();
 const r=await fetch('https://api.cricheroes.in'+path,{headers:{'api-key':Deno.env.get('CRICHEROES_PUBLIC_WEB_KEY')!,'udid':crypto.randomUUID().replaceAll('-',''),'device-type':'web','User-Agent':'Mozilla/5.0'}});
 if(!r.ok)throw Error(`CricHeroes HTTP ${r.status}; stopped, no retry`);
 const d=await r.json();if(!d.status)throw Error('CricHeroes rejected request');return d;
}
Deno.serve(async req=>{
 const secret=Deno.env.get('WILDHOGS_REFRESH_TOKEN');
 if(!secret || req.headers.get('x-refresh-token')!==secret)return Response.json({error:'Unauthorized'},{status:401});
 if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
 const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 let inserted=0,skipped=0;
 try {
  const body=await req.json().catch(()=>({}));
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const day=body.date||today;if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Bad date');
  const listed=await readAPI(`/api/v1/team/get-team-match/${TEAM}`);
  const matches=listed.data.filter((m:any)=>m.status==='past' && m.match_start_time?.slice(0,10)===day && (m.team_a_id===TEAM||m.team_b_id===TEAM));
  const unique=[...new Map(matches.map((m:any)=>[m.match_id,m])).values()] as any[];
  if(unique.length===0)return Response.json({status:'no_completed_match',date:day});
  if(unique.length!==1)return Response.json({status:'ambiguous_matches',date:day,ids:unique.map(m=>m.match_id)},{status:409});
  const mid=unique[0].match_id;const card=(await readAPI(`/api/v1/scorecard/v2/get-scorecard/${mid}`)).data;
  if(card.status!=='past')throw Error('Match not completed');
  const teams=[card.team_a,card.team_b];const ours=teams.find(t=>t.id===TEAM);const opp=teams.find(t=>t.id!==TEAM);if(!ours||!opp)throw Error('Team mismatch');
  const {data:profiles,error:pe}=await sb.from('profiles').select('id,username,cricheroes_player_id');if(pe)throw pe;
  const map=new Map(profiles!.filter(p=>p.cricheroes_player_id).map(p=>[p.cricheroes_player_id,p.id]));
  for(const [pid,username] of Object.entries(LEGACY)){const p=profiles!.find(p=>p.username===username);if(p)map.set(+pid,p.id);}
  const rows:any[]=[];
  for(const [t,kind] of [[ours,'batting'],[opp,'bowling']] as const)for(const inn of t.scorecard)for(const r of inn[kind]||[]){
   let uid=map.get(r.player_id);if(!uid){const nm=String(r.name||'').replace(/\([^)]*\)/g,'').replace(/\s+/g,' ').trim();if(!nm||!/^\d+$/.test(String(r.player_id)))throw Error(`Unknown player ${r.player_id}; cannot create profile`);
    const base=nm.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||('player-'+r.player_id);let un=base,n=0;while(profiles!.some(p=>p.username===un)){n++;un=base+'-'+n;}
    if(body.dry_run){uid='dry-'+r.player_id;}else{const ins=await sb.from('profiles').insert({username:un,display_name:nm+(n?' '+n:''),role:'Not specified',batting_style:'Not specified',bowling_style:'Not specified',external_url:`https://cricheroes.com/player-profile/${r.player_id}/${base}/matches`,cricheroes_player_id:r.player_id,unclaimed:true}).select('id,username,cricheroes_player_id').single();if(ins.error)throw ins.error;uid=ins.data.id;profiles!.push(ins.data as any);}
    map.set(r.player_id,uid);}
   const row:any={user_id:uid,kind,played_on:day,opponent:opp.name,source:'cricheroes',external_match_id:mid,external_player_id:r.player_id,external_inning:inn.inning};
   if(kind==='batting'){if(!['runs','balls','4s','6s'].every(k=>Number.isInteger(r[k])&&r[k]>=0))throw Error('Incomplete batting figures');Object.assign(row,{runs:r.runs,balls:r.balls,fours:r['4s'],sixes:r['6s'],source_dismissal:r.how_to_out,dismissal:['not out','retired hurt'].includes(r.how_to_out.toLowerCase())?'':r.how_to_out});}
   else {if(!['runs','wickets','wide','noball'].every(k=>Number.isInteger(r[k])&&r[k]>=0))throw Error('Incomplete bowling figures');Object.assign(row,{legal_balls:legal(r.overs),runs_given:r.runs,wickets:r.wickets,wides:r.wide,no_balls:r.noball,dismissal:''});}
   rows.push(row);
  }
  // Validate existing records before writing any new rows. Preserve PDF/history.
  const pending:any[]=[];
  for(const row of rows){
   const {data:existing,error}=await sb.from('innings').select('*').eq('user_id',row.user_id).eq('kind',row.kind).eq('played_on',day);if(error)throw error;
   const tagged=existing!.find(x=>x.external_match_id===mid&&x.external_inning===row.external_inning);if(tagged){const fields=row.kind==='batting'?['runs','balls','fours','sixes','dismissal']:['legal_balls','runs_given','wickets','wides','no_balls'];if(!fields.every(k=>tagged[k]===row[k]))throw Error('Source figures changed; manual review needed');skipped++;continue;}
   const same=existing!.filter(x=>x.opponent.toLowerCase()===row.opponent.toLowerCase());
   const fields=row.kind==='batting'?['runs','balls','fours','sixes','dismissal']:['legal_balls','runs_given','wickets','wides','no_balls'];
   if(same.some(x=>fields.every(k=>x[k]===row[k]))){skipped++;continue;}
   if(same.some(x=>x.source==='manual')){skipped++;continue;}if(same.length)throw Error('Existing same-day innings differs; manual review needed');pending.push(row);
  }
  if(!body.dry_run && pending.length){const {error}=await sb.from('innings').insert(pending);if(error)throw error;inserted=pending.length;}
  return Response.json({status:body.dry_run?'dry_run':'ok',match_id:mid,date:day,inserted,skipped,pending:pending.length});
 }catch(e){console.error(String(e));return Response.json({status:'blocked',error:String(e),inserted,skipped},{status:502});}
});
