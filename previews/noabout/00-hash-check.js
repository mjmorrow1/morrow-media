async () => {
  const ACCOUNT = 'a06ee855fe7aeffbd28053e7b05a3e7f';
  const KV = `/accounts/${ACCOUNT}/storage/kv/namespaces/ad8b4e83b63b4540a64f72d50dc73f7b`;
  const EXPECT = {
  "/_pages/404.html": "68b7d3994ca1da3ae1a499bf5341d4a171fb709013b433f16bf80b7194276829",
  "/_pages/about.html": "8215d37aaf5fe36ca89828612e8daa6f0359542b8103680599e3608b19d97722",
  "/_pages/brands.html": "3ad9f0c895979649c589d8fb4ab74359e8dad1b9e4b59ed10ee076b3e69b2388",
  "/_pages/contact-creator.html": "a8bb936def4462988a20e833a31455ac0d949f91986d581bbf4e0f8a2782ab64",
  "/_pages/contact-event.html": "f309c76f8e6cbad950d9eac90b170e8edb872213d0e8bacc9a9cb065309636bd",
  "/_pages/contact.html": "93a333849fd3de598382e34b88040c2b1fcf518fb4f654b1f678dd95c60c8571",
  "/_pages/creators.html": "df8038941544d8229870e8da3159b6275aa147da8047ecd9d1d19c93cf608255",
  "/_pages/credits.html": "687ff4a72bb9b316ab5f1da881951405cd78fa6fba981922a3935dd4549d0afc",
  "/_pages/home.html": "39d0f0d56f963f3c3714e23b9e5d7cf1ba1810424cf6686c752047a17eca72db",
  "/_pages/legal.html": "ff35b791f5569ef6eac61773db473341b38fe4bfdb697f27332e273182e1af4b",
  "/_pages/media.html": "b472f643460871d40f697e1bd82d28c1e9d21f69af3d030291c3ee92e2f1ddb1",
  "/_pages/services.html": "ece1e585a6741bfe26a7b2ed7987227085fb6f2e479c5e3ff3c08240767a05ec",
  "/_pages/sponsorships-founding-partner.html": "e7baa5e7adb53fdf763c4a575ed6e0c43075b7db1bd6ad2e8dc23bb373df89cf",
  "/_pages/sponsorships-inner-circle.html": "5373859178ed8cd00ed87c5dd83b13e7e232b326ebf873bbbe9a17a690b6d9d9",
  "/_pages/sponsorships-stakeholder.html": "e8df37d14b0b9fe3f8db0fb6b9564f64cdd95d90a80c06a570e3ab5e81ff2fa6",
  "/_pages/sponsorships.html": "6100b227035044b1919098b9319699f4436d9eadbc04cba35d9d225c23b19c91",
  "/_pages/thanks.html": "c9d44d7f9f65f4c509af16b67ca28017b9fff438d5ddc1c1421ea6bb0e2e42a2"
};
  function unwrap(v){ return v && typeof v==='object' && 'result' in v ? v.result : v; }
  function toBytes(v){ if (v instanceof Uint8Array) return v; if (typeof v==='string') return new TextEncoder().encode(v); throw new Error('bad'); }
  async function sha256(bytes){ const buf=await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
  async function textValue(raw){ return typeof raw==='string'?raw:new TextDecoder().decode(toBytes(raw)); }
  const rows=[];
  for (const [key, expect] of Object.entries(EXPECT)) {
    const current = await textValue(unwrap(await cloudflare.request({ method:'GET', path: KV+'/values/'+encodeURIComponent(key) })));
    const got = await sha256(new TextEncoder().encode(current));
    if (got !== expect) throw new Error('live hash drifted for '+key+' got='+got+' expected='+expect+' — stop and rebase the pack; do not overwrite later edits');
    rows.push({ key, ok:true, sha256: got });
  }
  return { ok:true, checked: rows, note:'KV matches the baselines this pack was built from. CSS was not part of this pack.' };
}
