async () => {
  const ACCOUNT = 'a06ee855fe7aeffbd28053e7b05a3e7f';
  const SCRIPT = 'morrow-media';
  const KV_NS = 'ad8b4e83b63b4540a64f72d50dc73f7b';
  const DB_ID = 'a9500a4a-00ac-4370-94a3-6ac6eb9181fd';
  const EXPECT_VERSION = '5ad8d7ad-3330-43c9-b547-2e08fcf94be7';
  const MSG = 'remove About page; 301 /about to home';
  function unwrap(v){ return v && typeof v==='object' && 'result' in v ? v.result : v; }
  function toBytes(v){ if (v instanceof Uint8Array) return v; if (typeof v==='string') return new TextEncoder().encode(v); throw new Error('bad'); }
  async function sha256(bytes){ const buf=await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
  function indexOf(hay, needle, from=0){ outer: for(let i=from;i+needle.length<=hay.length;i++){ for(let j=0;j<needle.length;j++) if(hay[i+j]!==needle[j]) continue outer; return i;} return -1; }
  function parseWorkerModule(u8){
    const decT=new TextDecoder(), encd=new TextEncoder();
    const nl=u8.indexOf(10); let line=u8.subarray(0,nl); if(line[line.length-1]===13) line=line.subarray(0,line.length-1);
    const btxt=decT.decode(line.subarray(2)); const delim=encd.encode('--'+btxt);
    let close=-1;
    function buildClose(useCr){ const prefix=useCr?new Uint8Array([13,10]):new Uint8Array([10]); const mid=encd.encode('--'+btxt+'--'); const out=new Uint8Array(prefix.length+mid.length); out.set(prefix,0); out.set(mid,prefix.length); return out; }
    for (const cl of [buildClose(true), buildClose(false)]) { const at=indexOf(u8,cl,nl); if(at>=0&&(close<0||at<close)) close=at; }
    let pos=0, found=null;
    while(pos<close){
      const at=indexOf(u8,delim,pos); if(at<0||at>=close) break;
      let p=at+delim.length; if(u8[p]===45&&u8[p+1]===45) break; if(u8[p]===13)p++; if(u8[p]===10)p++;
      const crlf=indexOf(u8,new Uint8Array([13,10,13,10]),p); const lf2=indexOf(u8,new Uint8Array([10,10]),p);
      let hend=-1,hlen=0; if(crlf>=0&&(lf2<0||crlf<=lf2)){hend=crlf;hlen=4;} else if(lf2>=0){hend=lf2;hlen=2;}
      const headers=decT.decode(u8.subarray(p,hend));
      const next=indexOf(u8,delim,hend+hlen); let bend=next; if(bend>=2&&u8[bend-2]===13&&u8[bend-1]===10)bend-=2; else if(bend>=1&&u8[bend-1]===10)bend-=1;
      const part=u8.subarray(hend+hlen,bend); if(headers.includes('name="worker.js"')) found=part; pos=next;
    }
    if(!found) throw new Error('no worker.js');
    return found;
  }
  const settings = unwrap(await cloudflare.request({ method:'GET', path:`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/settings` }));
  const bindings = settings.bindings||[];
  const email = bindings.find(b=>b.type==='send_email'&&b.name==='EMAIL');
  const site = bindings.find(b=>b.type==='kv_namespace'&&b.name==='SITE');
  const db = bindings.find(b=>b.type==='d1'&&b.name==='DB');
  const deps0 = unwrap(await cloudflare.request({ method:'GET', path:`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/deployments` }));
  const list0=Array.isArray(deps0)?deps0:(deps0.deployments||[]);
  const active0=list0.slice().sort((a,b)=>String(b.created_on||'').localeCompare(String(a.created_on||'')))[0];
  const prevVersion=(active0.versions||[]).find(v=>v.percentage===100)?.version_id;
  if (prevVersion !== EXPECT_VERSION) throw new Error('live worker is '+prevVersion+' not '+EXPECT_VERSION+'; stop and rebase. Do not deploy this pack.');
  const mod = parseWorkerModule(toBytes(unwrap(await cloudflare.request({ method:'GET', path:`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/content/v2` }))));
  let text = new TextDecoder().decode(mod);
  if (!text.includes('notifyFormAlert') || !text.includes('logo-lockup') || !text.includes('mw9ccfeat1')) throw new Error('unexpected module; refuse About redirect patch');
  if (text.includes('invoice_counters') || text.includes('/admin/invoices')) throw new Error('worker already contains unmerged invoicing code; refuse to overwrite');
  const needle = '"REDIRECTS_301":{';
  const i = text.indexOf(needle);
  if (i < 0) throw new Error('REDIRECTS_301 missing');
  if (text.split(needle).length-1 !== 1) throw new Error('REDIRECTS_301 not unique');
  if (text.includes('"/about":"/"')) return { ok:true, skipped:true, already:true, rollback_version_id: prevVersion };
  text = text.replace(needle, needle + '"/about":"/","/about.html":"/",');
  const next=new TextEncoder().encode(text);
  const metadata={
    main_module:'worker.js', compatibility_date:'2025-09-01',
    bindings:[
      { type:'kv_namespace', name:'SITE', namespace_id: site?.namespace_id||KV_NS },
      { type:'d1', name:'DB', id: db?.id||DB_ID },
      { type:'send_email', name:'EMAIL', destination_address: email?.destination_address||'matt@sbridgemedia.com' },
    ],
    observability:{ enabled:true, head_sampling_rate:1, logs:{ enabled:true, head_sampling_rate:1, persist:true, invocation_logs:true }, traces:{ enabled:false, persist:true, head_sampling_rate:1 } },
    keep_bindings:['secret_text'],
  };
  const fd=new FormData();
  fd.append('metadata', new Blob([JSON.stringify(metadata)],{type:'application/json'}));
  fd.append('worker.js', new Blob([next],{type:'application/javascript+module'}),'worker.js');
  unwrap(await cloudflare.request({ method:'PUT', path:`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}`, body:fd }));
  const deps=unwrap(await cloudflare.request({ method:'GET', path:`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/deployments` }));
  const list=Array.isArray(deps)?deps:(deps.deployments||[]);
  const active=list.slice().sort((a,b)=>String(b.created_on||'').localeCompare(String(a.created_on||'')))[0];
  return { ok:true, rollback_version_id: prevVersion, new_version_id:(active.versions||[]).find(v=>v.percentage===100)?.version_id, module_sha256: await sha256(next), message: MSG, version_unchanged: true, note:'Did not bump META.VERSION or CSS ?v= stamps. Purge page URLs only after KV writes.' };
}
