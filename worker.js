const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Content-Type, Range, If-Range, If-None-Match",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified",
  "Access-Control-Max-Age": "86400",
  "X-Content-Type-Options": "nosniff"
};

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, {status:204, headers:CORS});
    if (!["GET","HEAD"].includes(request.method)) return json({error:"Method not allowed"},405);
    if (incoming.pathname === "/health") return json({ok:true,service:"PlayID TV Worker",time:new Date().toISOString()});

    const backend = env.BACKEND_BASE_URL;
    if (!backend) return json({error:"BACKEND_BASE_URL is not configured"},500);

    let target;
    if (incoming.pathname === "/proxy") {
      const raw = incoming.searchParams.get("url");
      if (!raw) return json({error:"Missing url parameter"},400);
      try { target = new URL(raw); } catch { return json({error:"Invalid URL"},400); }
    } else if (incoming.pathname === "/player_api.php" || /^\/(live|movie|series)\//.test(incoming.pathname)) {
      target = new URL(incoming.pathname + incoming.search, backend);
    } else return json({error:"Not found"},404);

    const allowed = new Set([new URL(backend).hostname.toLowerCase(),
      ...(env.ALLOWED_UPSTREAM_HOSTS || "").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean)]);
    if (!["http:","https:"].includes(target.protocol) || !allowed.has(target.hostname.toLowerCase()))
      return json({error:"Upstream host is not allowlisted"},403);

    try {
      const upstream = await fetchSafe(target, request, env, allowed);
      if (upstream.status >= 300 && upstream.status < 400)
        return json({error:"Upstream redirect is not allowed",status:upstream.status},502);

      const effective = upstream.url || target.toString();
      const type = (upstream.headers.get("content-type") || "").toLowerCase();
      const playlist = type.includes("mpegurl") || /\.m3u8(?:$|\?)/i.test(effective);
      if (playlist && upstream.ok && request.method !== "HEAD") {
        const body = rewrite(await upstream.text(), effective, incoming.origin);
        const h = new Headers(CORS);
        h.set("Content-Type","application/vnd.apple.mpegurl; charset=utf-8");
        h.set("Cache-Control","no-store");
        return new Response(body,{status:upstream.status,headers:h});
      }

      const h = new Headers(CORS);
      for (const k of ["content-type","content-length","content-range","accept-ranges","etag","last-modified"]) {
        const v=upstream.headers.get(k); if(v) h.set(k,v);
      }
      h.set("Cache-Control",playlist?"no-store":"private, max-age=15");
      return new Response(request.method==="HEAD"?null:upstream.body,{status:upstream.status,headers:h});
    } catch(e) {
      return json({error:"Upstream request failed",message:String(e?.message||e)},502);
    }
  }
};

async function fetchSafe(initial, request, env, allowed) {
  let current=new URL(initial);
  for(let i=0;i<=3;i++){
    if(!allowed.has(current.hostname.toLowerCase())) throw new Error("Redirect destination is not allowlisted");
    const headers=new Headers();
    for(const k of ["accept","range","if-range","if-none-match"]){const v=request.headers.get(k);if(v)headers.set(k,v);}
    if(env.UPSTREAM_REFERER) headers.set("Referer",env.UPSTREAM_REFERER);
    if(env.UPSTREAM_ORIGIN) headers.set("Origin",env.UPSTREAM_ORIGIN);
    const res=await fetch(current.toString(),{method:request.method,headers,redirect:"manual"});
    if(![301,302,303,307,308].includes(res.status)) return res;
    const loc=res.headers.get("location");
    if(!loc||i===3) return res;
    current=new URL(loc,current);
    if(!["http:","https:"].includes(current.protocol)) throw new Error("Unsupported redirect protocol");
  }
  throw new Error("Too many redirects");
}

function rewrite(text, playlistUrl, origin) {
  const base=new URL(playlistUrl);
  const proxy=ref=>`${origin}/proxy?url=${encodeURIComponent(new URL(ref,base).toString())}`;
  return text.split(/\r?\n/).map(line=>{
    const t=line.trim(); if(!t)return line;
    if(t.startsWith("#")) return line.replace(/URI="([^"]+)"/g,(_m,u)=>`URI="${proxy(u)}"`);
    return proxy(t);
  }).join("\n");
}
function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
}
