async () => {
  const ACCOUNT = 'a06ee855fe7aeffbd28053e7b05a3e7f';
  const SCRIPT = 'morrow-media';
  const KV = `/accounts/${ACCOUNT}/storage/kv/namespaces/ad8b4e83b63b4540a64f72d50dc73f7b`;
  const ROLLBACK_VERSION = '5ad8d7ad-3330-43c9-b547-2e08fcf94be7';
  const KEYS = ["/_pages/home.html", "/_pages/media.html", "/_pages/creators.html", "/_pages/sponsorships.html", "/_pages/legal.html", "/_pages/about.html", "/_pages/brands.html", "/_pages/services.html", "/_pages/contact.html", "/_pages/credits.html", "/_pages/thanks.html", "/_pages/contact-creator.html", "/_pages/contact-event.html", "/_pages/sponsorships-founding-partner.html", "/_pages/sponsorships-inner-circle.html", "/_pages/sponsorships-stakeholder.html", "/_pages/404.html"];
  function unwrap(v){ return v && typeof v==='object' && 'result' in v ? v.result : v; }
  function toBytes(v){ if (v instanceof Uint8Array) return v; if (typeof v==='string') return new TextEncoder().encode(v); throw new Error('bad'); }
  async function textValue(raw){ return typeof raw==='string'?raw:new TextDecoder().decode(toBytes(raw)); }
  const restored=[];
  for (const key of KEYS) {
    const bkey = '/_backups/noabout-'+key.replace(/^\//,'').replace(/\//g,'_');
    const body = await textValue(unwrap(await cloudflare.request({ method:'GET', path: KV+'/values/'+encodeURIComponent(bkey) })));
    unwrap(await cloudflare.request({ method:'PUT', path: KV+'/bulk', body:[{ key, value: body, metadata:{ ct:'text/html; charset=utf-8' } }] }));
    restored.push(key);
  }
  const rolled = unwrap(await cloudflare.request({ method:'POST', path:`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/deployments`, body:{ annotations:{ 'workers/message':'Rollback About-page removal' }, strategy:'percentage', versions:[{ version_id: ROLLBACK_VERSION, percentage:100 }] } }));
  return { ok:true, restored, worker: rolled.id||rolled, rollback_version: ROLLBACK_VERSION };
}
