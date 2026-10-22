import { handleV2Api } from './v2';
interface PlatformEnv { DB: D1Database; PRODUCT_FILES?: R2Bucket; ADMIN_EMAIL?: string; STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string; }
type Session = { id: string; email: string };
type Body = Record<string, unknown>;
type Product = { id:string;product_key:string;title:string;description:string;product_type:string;price_amount:number;currency:string;is_free:number;is_published:number;checkout_url:string|null;file_key:string;original_filename:string;file_content_type:string;created_at:string;updated_at:string };
const COOKIE = 'sf_session', MAX_FILE_BYTES = 25 * 1024 * 1024;
function reply(body: unknown, status=200, extra?: HeadersInit): Response { const h=new Headers(extra);h.set('Content-Type','application/json; charset=utf-8');h.set('Cache-Control','no-store');h.set('X-Content-Type-Options','nosniff');return new Response(JSON.stringify(body),{status,headers:h}); }
function tokenFrom(r:Request):string|null { const h=r.headers.get('Cookie')||'';for(const p of h.split(';')){const i=p.indexOf('=');if(i>=0&&p.slice(0,i).trim()===COOKIE)return p.slice(i+1).trim()||null;}return null; }
async function digest(v:string):Promise<string>{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');}
async function sessionFor(r:Request,e:PlatformEnv):Promise<Session|null>{const t=tokenFrom(r);if(!t)return null;return e.DB.prepare('SELECT u.id,u.email FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? LIMIT 1').bind(await digest(t),Date.now()).first<Session>();}
function isAdmin(s:Session|null,e:PlatformEnv):boolean{return Boolean(s&&e.ADMIN_EMAIL&&s.email.trim().toLowerCase()===e.ADMIN_EMAIL.trim().toLowerCase());}
function badOrigin(r:Request):boolean{const o=r.headers.get('Origin');return ['POST','PUT','PATCH','DELETE'].includes(r.method.toUpperCase())&&Boolean(o&&o!==new URL(r.url).origin);}
async function readBody(r:Request):Promise<Body>{if(!(r.headers.get('Content-Type')||'').toLowerCase().includes('application/json'))throw new Error('Dane muszą być przesłane jako JSON.');const x:unknown=await r.json();if(!x||typeof x!=='object'||Array.isArray(x))throw new Error('Nieprawidłowe dane formularza.');return x as Body;}
function field(b:Body,k:string,max=2000):string{const x=typeof b[k]==='string'?(b[k] as string).trim():'';if(x.length>max)throw new Error('Pole '+k+' jest zbyt długie.');return x;}
async function product(e:PlatformEnv,k:string):Promise<Product|null>{return e.DB.prepare('SELECT * FROM products WHERE product_key=? LIMIT 1').bind(k).first<Product>();}
async function adminGate(r:Request,e:PlatformEnv){const s=await sessionFor(r,e);if(!s)return{session:null,response:reply({error:'Zaloguj się ponownie.'},401)};if(!isAdmin(s,e))return{session:s,response:reply({error:'Ta funkcja jest dostępna wyłącznie dla administratora.'},403)};return{session:s,response:null};}
function safeFileName(n:string):string{return(n.split(/[\\/]/).pop()||'material').normalize('NFKD').replace(/[^\w.\- ]/g,'').trim().replace(/\s+/g,'_').slice(0,140)||'material';}
function fromHex(value: string): Uint8Array { const clean = value.trim(); if (!/^(?:[0-9a-f]{2})+$/i.test(clean)) return new Uint8Array(); return Uint8Array.from(clean.match(/.{2}/g) || [], (x) => parseInt(x, 16)); }
async function verifyStripeSignature(raw: string, header: string | null, secret: string): Promise<boolean> {
 if (!header) return false;
 const parts = header.split(',').map((item) => item.trim().split('='));
 const timestamp = parts.find(([key]) => key === 't')?.[1];
 const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value || '');
 if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length) return false;
 if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
 const message = new TextEncoder().encode(`${timestamp}.${raw}`);
 for (const signature of signatures) { const bytes = fromHex(signature); if (bytes.length && await crypto.subtle.verify('HMAC', key, bytes, message)) return true; }
 return false;
}
export async function handlePlatformApi(request:Request,env:PlatformEnv):Promise<Response|null>{
 const v2Response = await handleV2Api(request, env);
 if (v2Response) return v2Response;
 const path=new URL(request.url).pathname,method=request.method.toUpperCase();
  if(path==='/api/stripe/webhook' && method==='POST') {
   if(!env.STRIPE_WEBHOOK_SECRET)return reply({error:'Webhook Stripe nie jest skonfigurowany.'},503);
   const raw=await request.text();
   if(!(await verifyStripeSignature(raw,request.headers.get('Stripe-Signature'),env.STRIPE_WEBHOOK_SECRET)))return reply({error:'Nieprawidłowy podpis webhooka Stripe.'},400);
   let event:Record<string,any>;try{event=JSON.parse(raw) as Record<string,any>;}catch{return reply({error:'Nieprawidłowe zdarzenie Stripe.'},400);}
   const eventId=typeof event.id==='string'?event.id:'',eventType=typeof event.type==='string'?event.type:'';
   if(!eventId)return reply({error:'Brak identyfikatora zdarzenia Stripe.'},400);
   if(eventType!=='checkout.session.completed'&&eventType!=='checkout.session.async_payment_succeeded')return reply({received:true,ignored:true});
   const checkout=event.data?.object as Record<string,any>|undefined;
   if(!checkout||checkout.object!=='checkout.session'||checkout.mode!=='payment'||checkout.payment_status!=='paid')return reply({received:true,ignored:true});
   const userId=typeof checkout.metadata?.user_id==='string'?checkout.metadata.user_id:'',key=typeof checkout.metadata?.product_key==='string'?checkout.metadata.product_key:'',sessionId=typeof checkout.id==='string'?checkout.id:'',expectedAmount=Number(checkout.metadata?.unit_amount_cents);
   const amount=Number(checkout.amount_total),currency=typeof checkout.currency==='string'?checkout.currency.toUpperCase():'PLN';
   if(!userId||!key||!sessionId||!Number.isFinite(amount)||amount<=0)return reply({error:'Brak danych zamówienia w sesji Stripe.'},400);
   const priorEvent=await env.DB.prepare('SELECT event_id FROM stripe_webhook_events WHERE event_id=? LIMIT 1').bind(eventId).first<{event_id:string}>();
   if(priorEvent)return reply({received:true,duplicate:true});
   const existingOrder=await env.DB.prepare('SELECT id FROM orders WHERE order_number=? LIMIT 1').bind(`STRIPE-${sessionId}`).first<{id:string}>();
   const user=await env.DB.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(userId).first<{id:string}>();
   const item=await env.DB.prepare('SELECT id,product_key,title,product_type,is_free,price_amount,currency FROM products WHERE product_key=? LIMIT 1').bind(key).first<{id:string;product_key:string;title:string;product_type:string;is_free:number;price_amount:number;currency:string}>();
   if(!user||!item||String(checkout.client_reference_id||'')!==userId||String(checkout.metadata?.product_id||'')!==item.id||currency!==(item.currency||'PLN').toUpperCase())return reply({error:'Nie udało się dopasować opłaconej sesji do użytkownika lub produktu.'},400);
   if(!Number.isFinite(expectedAmount)||expectedAmount<=0||expectedAmount!==amount)return reply({error:'Kwota płatności nie zgadza się z ceną zapisaną w sesji.'},400);
   const now=new Date().toISOString();
   if(existingOrder){await env.DB.prepare('INSERT INTO stripe_webhook_events (event_id,event_type,received_at) VALUES (?,?,?)').bind(eventId,eventType,now).run();return reply({received:true,duplicate:true});}
   const orderId=crypto.randomUUID(),entitlement=await env.DB.prepare("SELECT id FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active' LIMIT 1").bind(userId,key).first<{id:string}>();
   const stmts:D1PreparedStatement[]=[
    env.DB.prepare('INSERT INTO stripe_webhook_events (event_id,event_type,received_at) VALUES (?,?,?)').bind(eventId,eventType,now),
    env.DB.prepare("INSERT INTO orders (id,user_id,order_number,status,total_amount,currency,created_at,updated_at) VALUES (?,?,?,'paid',?,?,?,?)").bind(orderId,userId,`STRIPE-${sessionId}`,amount/100,currency,now,now),
    env.DB.prepare('INSERT INTO order_items (id,order_id,product_key,product_title,product_type,quantity,unit_amount,created_at) VALUES (?,?,?,?,?,1,?,?)').bind(crypto.randomUUID(),orderId,key,item.title,item.product_type,amount/100,now,now)
   ];
   if(!entitlement)stmts.push(env.DB.prepare("INSERT INTO user_entitlements (id,user_id,order_id,product_key,product_title,product_type,access_status,created_at) VALUES (?,?,?,?,?,?,'active',?)").bind(crypto.randomUUID(),userId,orderId,key,item.title,item.product_type,now));
   await env.DB.batch(stmts);return reply({received:true,paid:true});
  }
  if(badOrigin(request))return reply({error:'Żądanie pochodzi z nieprawidłowej strony.'},403);
  try {
  if(path==='/api/checkout/session' && method==='POST'){
   const s=await sessionFor(request,env);if(!s)return reply({error:'Zaloguj się, aby kupić produkt.'},401);
   if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET)return reply({error:'Płatności Stripe nie są w pełni skonfigurowane. Sprzedaż zostanie uruchomiona po ustawieniu klucza API i webhooka.'},503);
   const b=await readBody(request),key=field(b,'product_key',100);if(!key)return reply({error:'Brak klucza produktu.'},400);
   const p=await product(env,key);if(!p||!p.is_published)return reply({error:'Produkt nie jest dostępny.'},404);if(p.is_free)return reply({error:'Ten produkt jest bezpłatny — użyj opcji odbioru.'},400);
   if(!Number.isFinite(Number(p.price_amount))||Number(p.price_amount)<=0)return reply({error:'Produkt nie ma prawidłowej ceny.'},400);
   const origin=new URL(request.url).origin,form=new URLSearchParams();
   form.set('mode','payment');form.set('success_url',`${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`);form.set('cancel_url',`${origin}/?payment=cancelled`);form.set('client_reference_id',s.id);form.set('customer_email',s.email);
   form.set('line_items[0][price_data][currency]',(p.currency||'PLN').toLowerCase());form.set('line_items[0][price_data][unit_amount]',String(Math.round(Number(p.price_amount)*100)));form.set('line_items[0][price_data][product_data][name]',p.title);form.set('line_items[0][quantity]','1');
   if(p.description)form.set('line_items[0][price_data][product_data][description]',p.description.slice(0,500));
   form.set('metadata[user_id]',s.id);form.set('metadata[product_key]',p.product_key);form.set('metadata[product_id]',p.id);form.set('metadata[unit_amount_cents]',String(Math.round(Number(p.price_amount)*100)));
   form.set('payment_intent_data[metadata][user_id]',s.id);form.set('payment_intent_data[metadata][product_key]',p.product_key);
   const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
   const payload=await response.json() as Record<string,any>;if(!response.ok||typeof payload.url!=='string')return reply({error:typeof payload.error?.message==='string'?'Stripe: '+payload.error.message:'Nie udało się utworzyć sesji płatności Stripe.'},502);
   return reply({url:payload.url,session_id:payload.id});
  }
  if(path==='/api/products'&&method==='GET'){
   const rows=await env.DB.prepare('SELECT id,product_key,title,description,product_type,price_amount,currency,is_free,is_published,checkout_url,created_at FROM products WHERE is_published=1 ORDER BY created_at DESC').all();return reply({products:rows.results});
  }
  if(path==='/api/admin/me'&&method==='GET'){const s=await sessionFor(request,env);return reply({isAdmin:isAdmin(s,env)});}
  if(path==='/api/admin/products'&&method==='GET'){
   const g=await adminGate(request,env);if(g.response)return g.response;
   const rows=await env.DB.prepare('SELECT id,product_key,title,description,product_type,price_amount,currency,is_free,is_published,checkout_url,original_filename,created_at FROM products ORDER BY created_at DESC').all();return reply({products:rows.results});
  }
  if(path==='/api/admin/files'&&method==='GET'){
   const g=await adminGate(request,env);if(g.response)return g.response;
   if(!env.PRODUCT_FILES)return reply({error:'Magazyn plików R2 nie jest skonfigurowany.'},503);
   const result=await env.PRODUCT_FILES.list({limit:1000});
   const files=result.objects.filter((obj)=>/\.(pdf|xlsx|docx|zip|csv|txt)$/i.test(obj.key)&&obj.size>0&&obj.size<=MAX_FILE_BYTES).map((obj)=>({key:obj.key,name:(obj.key.split('/').pop()||obj.key),size:obj.size,uploaded:obj.uploaded.toISOString()}));
   return reply({files,truncated:result.truncated});
  }
  const updateMatch=path.match(/^\/api\/admin\/products\/([a-z0-9-]+)$/);
  if(updateMatch&&method==='PATCH'){
   const g=await adminGate(request,env);if(g.response)return g.response;
   const key=updateMatch[1],existing=await product(env,key);if(!existing)return reply({error:'Nie znaleziono produktu.'},404);
   const b=await readBody(request);
   const priceRaw=b.price_amount===undefined?existing.price_amount:Number(b.price_amount);
   const isFree=b.is_free===undefined?Boolean(existing.is_free):b.is_free===true;
   const isPublished=b.is_published===undefined?Boolean(existing.is_published):b.is_published===true;
   const checkout=b.checkout_url===undefined?(existing.checkout_url||''):field(b,'checkout_url',1000);
   if(!Number.isFinite(priceRaw)||priceRaw<0||priceRaw>100000)return reply({error:'Cena musi mieścić się w zakresie 0–100 000 zł.'},400);
   if(isPublished&&!isFree&&priceRaw<=0)return reply({error:'Przed publikacją produktu płatnego ustaw cenę większą od zera.'},400);
   if(checkout){try{if(new URL(checkout).protocol!=='https:')throw new Error();}catch{return reply({error:'Link zakupu musi być prawidłowym adresem HTTPS.'},400);}}
   const now=new Date().toISOString();
   await env.DB.prepare('UPDATE products SET price_amount=?,is_free=?,is_published=?,checkout_url=?,updated_at=? WHERE product_key=?')
    .bind(isFree?0:priceRaw,isFree?1:0,isPublished?1:0,checkout||null,now,key).run();
   return reply({ok:true,product:await product(env,key)});
  }
  if(path==='/api/admin/products'&&method==='POST'){
   const g=await adminGate(request,env);if(g.response)return g.response;if(!env.PRODUCT_FILES)return reply({error:'Magazyn plików R2 nie jest skonfigurowany. Utwórz bucket i dodaj binding PRODUCT_FILES.'},503);
    const f=await request.formData(),title=String(f.get('title')||'').trim(),key=String(f.get('product_key')||'').trim().toLowerCase(),description=String(f.get('description')||'').trim(),type=String(f.get('product_type')||'ebook'),free=String(f.get('is_free')||'')==='true',published=String(f.get('is_published')||'')==='true',price=Number(f.get('price_amount')||0),checkout=String(f.get('checkout_url')||'').trim(),file=f.get('file'),existingFileKey=String(f.get('existing_file_key')||'').trim();
    if(title.length<2||title.length>140)return reply({error:'Nazwa produktu musi mieć 2–140 znaków.'},400);
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)||key.length>100)return reply({error:'Klucz produktu używa małych liter, cyfr i myślników, np. zacznij-trenowac.'},400);
    if(description.length<2||description.length>2000)return reply({error:'Opis musi mieć 2–2000 znaków.'},400);
    if(!['ebook','training_plan','guide','bundle','other'].includes(type))return reply({error:'Nieprawidłowy typ produktu.'},400);
    if(!free&&(!Number.isFinite(price)||price<=0||price>100000))return reply({error:'Cena płatnego produktu musi być większa od zera.'},400);
    if(checkout){try{if(new URL(checkout).protocol!=='https:')throw new Error();}catch{return reply({error:'Link zakupu musi być prawidłowym adresem HTTPS.'},400);}}
    if(await product(env,key))return reply({error:'Produkt o takim kluczu już istnieje. Użyj innego klucza.'},409);
    const selectedExisting=Boolean(existingFileKey),selectedNew=file instanceof File&&file.size>0;
    if(selectedExisting&&selectedNew)return reply({error:'Wybierz plik z R2 albo prześlij nowy plik — nie oba naraz.'},400);
    if(!selectedExisting&&!selectedNew)return reply({error:'Wybierz istniejący plik z R2 albo prześlij nowy plik.'},400);
    let fileKey='',originalFilename='',contentType='application/octet-stream',uploadedNewFile=false;
    if(selectedExisting){
     if(existingFileKey.length>1024||existingFileKey.startsWith('/')||existingFileKey.includes('..')||existingFileKey.includes('\\'))return reply({error:'Nieprawidłowa ścieżka istniejącego pliku.'},400);
     const object=await env.PRODUCT_FILES.get(existingFileKey);if(!object)return reply({error:'Wybrany plik nie istnieje już w R2.'},404);
     originalFilename=safeFileName(existingFileKey.split('/').pop()||'material');
     if(!/\.(pdf|xlsx|docx|zip|csv|txt)$/i.test(originalFilename))return reply({error:'Wybrany plik ma niedozwolony format.'},400);
     if(object.size>MAX_FILE_BYTES)return reply({error:'Wybrany plik przekracza limit 25 MB.'},400);
     fileKey=existingFileKey;contentType=object.httpMetadata?.contentType||'application/octet-stream';
    }else{
     if(!(file instanceof File)||file.size>MAX_FILE_BYTES)return reply({error:'Wybierz plik o rozmiarze do 25 MB.'},400);
     if(!/\.(pdf|xlsx|docx|zip|csv|txt)$/i.test(file.name))return reply({error:'Dozwolone formaty: PDF, XLSX, DOCX, ZIP, CSV i TXT.'},400);
     fileKey='products/'+crypto.randomUUID()+'/'+safeFileName(file.name);originalFilename=file.name;contentType=file.type||'application/octet-stream';
     await env.PRODUCT_FILES.put(fileKey,await file.arrayBuffer(),{httpMetadata:{contentType,cacheControl:'private, no-store'}});uploadedNewFile=true;
    }
    const id=crypto.randomUUID(),now=new Date().toISOString();
    try{await env.DB.prepare('INSERT INTO products (id,product_key,title,description,product_type,price_amount,currency,is_free,is_published,checkout_url,file_key,original_filename,file_content_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,key,title,description,type,free?0:price,'PLN',free?1:0,published?1:0,checkout||null,fileKey,originalFilename,contentType,now,now).run();}
    catch(err){if(uploadedNewFile)await env.PRODUCT_FILES.delete(fileKey);throw err;}
   return reply({ok:true,product:await product(env,key)},201);
  }
  const match=path.match(/^\/api\/products\/([a-z0-9-]+)\/(claim|download)$/);
  if(match){
   const key=match[1],action=match[2],s=await sessionFor(request,env),p=await product(env,key);
   if(!p||(!p.is_published&&!isAdmin(s,env)))return reply({error:'Nie znaleziono produktu.'},404);if(!s)return reply({error:'Zaloguj się, aby uzyskać dostęp do materiału.'},401);
   if(action==='claim'&&method==='POST'){
    if(!p.is_free||!p.is_published)return reply({error:'Ten produkt nie jest dostępny do samodzielnego bezpłatnego odblokowania.'},403);
    const old=await env.DB.prepare("SELECT id FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active' LIMIT 1").bind(s.id,key).first<{id:string}>();
    if(!old)await env.DB.prepare("INSERT INTO user_entitlements (id,user_id,order_id,product_key,product_title,product_type,access_status,created_at) VALUES (?,?,NULL,?,?,?,'active',?)").bind(crypto.randomUUID(),s.id,key,p.title,p.product_type,new Date().toISOString()).run();
    return reply({ok:true});
   }
   if(action==='download'&&method==='GET'){
    const allowed=isAdmin(s,env)||Boolean(await env.DB.prepare("SELECT id FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active' LIMIT 1").bind(s.id,key).first<{id:string}>());if(!allowed)return reply({error:'Brak dostępu do tego pliku. Odblokuj darmowy materiał albo potwierdź zakup.'},403);
    if(!env.PRODUCT_FILES)return reply({error:'Magazyn plików R2 nie jest skonfigurowany.'},503);const obj=await env.PRODUCT_FILES.get(p.file_key);if(!obj)return reply({error:'Plik produktu nie znajduje się w magazynie.'},404);
    const h=new Headers();h.set('Content-Type',p.file_content_type||'application/octet-stream');h.set('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(p.original_filename).replace(/'/g,'%27'));h.set('Cache-Control','private, no-store');h.set('X-Content-Type-Options','nosniff');return new Response(obj.body,{status:200,headers:h});
   }
   return reply({error:'Nieobsługiwana metoda.'},405);
  }
  if(path==='/api/admin/grant-access'&&method==='POST'){
   const g=await adminGate(request,env);if(g.response)return g.response;const b=await readBody(request),email=field(b,'email',254).toLowerCase(),key=field(b,'product_key',100).toLowerCase();if(!email||!key)return reply({error:'Podaj adres e-mail i klucz produktu.'},400);
   const u=await env.DB.prepare('SELECT id,email FROM users WHERE email=? LIMIT 1').bind(email).first<{id:string;email:string}>();if(!u)return reply({error:'Nie znaleziono konta o takim adresie e-mail.'},404);
   const p=await product(env,key);if(!p)return reply({error:'Nie znaleziono produktu.'},404);if(p.is_free)return reply({error:'Darmowy produkt użytkownik może odblokować samodzielnie.'},400);
   const old=await env.DB.prepare("SELECT id FROM user_entitlements WHERE user_id=? AND product_key=? AND access_status='active' LIMIT 1").bind(u.id,key).first<{id:string}>();if(old)return reply({ok:true,already_active:true});
   const orderId=crypto.randomUUID(),now=new Date().toISOString(),number='SF-MANUAL-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomUUID().slice(0,8).toUpperCase();
   await env.DB.prepare("INSERT INTO orders (id,user_id,order_number,status,total_amount,currency,created_at,updated_at) VALUES (?,?,?,'paid',?,'PLN',?,?)").bind(orderId,u.id,number,p.price_amount,now,now).run();
   await env.DB.prepare('INSERT INTO order_items (id,order_id,product_key,product_title,product_type,quantity,unit_amount,created_at) VALUES (?,?,?,?,?,1,?,?)').bind(crypto.randomUUID(),orderId,key,p.title,p.product_type,p.price_amount,now).run();
   await env.DB.prepare("INSERT INTO user_entitlements (id,user_id,order_id,product_key,product_title,product_type,access_status,created_at) VALUES (?,?,?,?,?,?,'active',?)").bind(crypto.randomUUID(),u.id,orderId,key,p.title,p.product_type,now).run();return reply({ok:true,order_number:number});
  }
  if(path==='/api/training/plan'&&['GET','PUT'].includes(method)){
   const s=await sessionFor(request,env);if(!s)return reply({error:'Zaloguj się ponownie.'},401);
   if(method==='GET'){
    const rows=await env.DB.prepare('SELECT day_key,title,exercises_json,updated_at FROM training_plan_days WHERE user_id=? ORDER BY day_key').bind(s.id).all<{day_key:'A'|'B'|'C';title:string;exercises_json:string;updated_at:string}>();
    const days=rows.results.map(row=>{let exercises:unknown[]=[];try{const parsed:unknown=JSON.parse(row.exercises_json);if(Array.isArray(parsed))exercises=parsed;}catch{}return{day_key:row.day_key,title:row.title,exercises,updated_at:row.updated_at};});
    return reply({days});
   }
   const b=await readBody(request),key=field(b,'day_key',1).toUpperCase(),title=field(b,'title',120),raw=Array.isArray(b.exercises)?b.exercises:[];
   if(!['A','B','C'].includes(key))return reply({error:'Wybierz dzień A, B lub C.'},400);
   if(title.length<2)return reply({error:'Nazwa dnia musi mieć co najmniej 2 znaki.'},400);
   if(raw.length<1||raw.length>20)return reply({error:'Dodaj od 1 do 20 ćwiczeń do dnia.'},400);
   const list:Array<{name:string;sets:number;reps:number}> = [];
   for(const val of raw){if(!val||typeof val!=='object'||Array.isArray(val))return reply({error:'Nieprawidłowe ćwiczenie w planie.'},400);const x=val as Record<string,unknown>,name=typeof x.name==='string'?x.name.trim():'',sets=Number(x.sets),reps=Number(x.reps);if(!name||name.length>100||!Number.isInteger(sets)||sets<1||sets>20||!Number.isInteger(reps)||reps<1||reps>100)return reply({error:'Sprawdź nazwy ćwiczeń, serie i powtórzenia.'},400);list.push({name,sets,reps});}
   const now=new Date().toISOString();await env.DB.prepare('INSERT INTO training_plan_days (id,user_id,day_key,title,exercises_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,day_key) DO UPDATE SET title=excluded.title,exercises_json=excluded.exercises_json,updated_at=excluded.updated_at').bind(crypto.randomUUID(),s.id,key,title,JSON.stringify(list),now,now).run();
   return reply({ok:true,day:{day_key:key,title,exercises:list,updated_at:now}});
  }
  if(path==='/api/training/sessions'&&['GET','POST'].includes(method)){
   const s=await sessionFor(request,env);if(!s)return reply({error:'Zaloguj się ponownie.'},401);
   if(method==='GET'){const r=await env.DB.prepare('SELECT id,title,performed_on,notes,exercises_json,created_at FROM workout_sessions WHERE user_id=? ORDER BY performed_on DESC,created_at DESC LIMIT 100').bind(s.id).all();return reply({sessions:r.results});}
   const b=await readBody(request),title=field(b,'title',120),day=field(b,'performed_on',10),notes=field(b,'notes',1000);if(title.length<2)return reply({error:'Podaj nazwę treningu.'},400);if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day+'T12:00:00Z')))return reply({error:'Nieprawidłowa data treningu.'},400);
   const raw=Array.isArray(b.exercises)?b.exercises:[];if(raw.length<1||raw.length>20)return reply({error:'Dodaj od 1 do 20 ćwiczeń.'},400);const list: Array<{name:string;sets:number;reps:number;weight_kg:number|null}> = [];
   for(const entry of raw){if(!entry||typeof entry!=='object'||Array.isArray(entry))return reply({error:'Nieprawidłowe ćwiczenie.'},400);const x=entry as Record<string,unknown>,name=typeof x.name==='string'?x.name.trim():'',sets=Number(x.sets),reps=Number(x.reps),weight=x.weight_kg==null?null:Number(x.weight_kg);if(!name||name.length>100||!Number.isInteger(sets)||sets<1||sets>20||!Number.isInteger(reps)||reps<1||reps>100||(weight!==null&&(!Number.isFinite(weight)||weight<0||weight>1000)))return reply({error:'Sprawdź nazwę ćwiczenia, serie, powtórzenia i ciężar.'},400);list.push({name,sets,reps,weight_kg:weight});}
   const id=crypto.randomUUID(),now=new Date().toISOString();await env.DB.prepare('INSERT INTO workout_sessions (id,user_id,title,performed_on,notes,exercises_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,s.id,title,day,notes,JSON.stringify(list),now,now).run();return reply({ok:true,id},201);
  }
  if(path==='/api/training/checkins'&&['GET','POST'].includes(method)){
   const s=await sessionFor(request,env);if(!s)return reply({error:'Zaloguj się ponownie.'},401);
   if(method==='GET'){const r=await env.DB.prepare('SELECT id,week_start,training_count,regularity,notes,created_at FROM weekly_checkins WHERE user_id=? ORDER BY week_start DESC LIMIT 16').bind(s.id).all();return reply({checkins:r.results});}
   const b=await readBody(request),week=field(b,'week_start',10),count=Number(b.training_count),rating=Number(b.regularity),notes=field(b,'notes',1000);if(!/^\d{4}-\d{2}-\d{2}$/.test(week)||Number.isNaN(Date.parse(week+'T12:00:00Z')))return reply({error:'Nieprawidłowy początek tygodnia.'},400);if(!Number.isInteger(count)||count<0||count>14||!Number.isInteger(rating)||rating<1||rating>5)return reply({error:'Liczba treningów musi wynosić 0–14, a regularność 1–5.'},400);
   const now=new Date().toISOString();await env.DB.prepare('INSERT INTO weekly_checkins (id,user_id,week_start,training_count,regularity,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,week_start) DO UPDATE SET training_count=excluded.training_count,regularity=excluded.regularity,notes=excluded.notes,updated_at=excluded.updated_at').bind(crypto.randomUUID(),s.id,week,count,rating,notes,now,now).run();return reply({ok:true});
  }
  return null;
 }catch(error){console.error('System Formy platform API error:',error);return reply({error:error instanceof Error?error.message:'Nie udało się wykonać operacji.'},500);}
}

/** Global password gate. Called before API and ASSETS routing. */
export async function handleSitePageLock(request: Request, env: { DB: D1Database }): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  // The ACP shell is deliberately available so the admin can authenticate and turn the lock off.
  // Authorization is still enforced in each admin API endpoint.
  const isMaintenancePage = path === '/maintenance';
  // Public login/registration are also gated. Only allow login when explicitly coming to ACP.
  const isAdminLogin = path === '/login' && ((url.searchParams.get('next') || '') === '/acp' || (url.searchParams.get('next') || '').startsWith('/acp/'));
  const isAdminShell = path === '/acp' || path.startsWith('/acp/') || isAdminLogin;
  const isStaticAsset = /\.(?:js|mjs|css|map|png|jpe?g|webp|avif|svg|ico|woff2?|ttf)$/i.test(path) || path.startsWith('/assets/');
  // Site-lock API and authentication routes are checked before the gate; other API calls receive JSON 423.
  const isUnlockEndpoint = path === '/api/v2/site-lock/unlock' && request.method.toUpperCase() === 'POST';
  const isLockStatusEndpoint = path === '/api/v2/site-lock/status' && request.method.toUpperCase() === 'GET';
  const isAuthOrAdminApi = path.startsWith('/api/v2/admin/') || path === '/api/auth/login' || path === '/api/auth/logout' || path === '/api/auth/me' || path === '/api/auth/register' || path === '/api/admin/me' || path === '/api/v2/presence/heartbeat';
  if (isAdminShell || isStaticAsset || isUnlockEndpoint || isLockStatusEndpoint || isAuthOrAdminApi) return null;

  const config = await env.DB.prepare("SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('site_lock_enabled','site_lock_password_hash','maintenance_message','maintenance_until')").all<{setting_key:string;setting_value:string}>().catch(() => null);
  const values: Record<string,string> = {};
  for (const row of config?.results || []) values[row.setting_key] = row.setting_value;
  if (!isMaintenancePage && (values.site_lock_enabled !== 'true' || !values.site_lock_password_hash)) return null;

  // Unlock tokens are short-lived HMACs. Never place the password hash itself in a browser cookie.
  const cookieHeader = request.headers.get('Cookie') || '';
  const token = cookieHeader.split(';').map(x => x.trim()).find(x => x.startsWith('sf_site_unlock='))?.slice('sf_site_unlock='.length) || '';
  if (token && values.site_lock_password_hash && await verifySiteUnlockToken(values.site_lock_password_hash, token)) {
    if (isMaintenancePage) return Response.redirect(new URL('/', url).toString(), 302);
    return null;
  }

  // API consumers need JSON responses, not HTML. Public document routes redirect to
  // one dedicated maintenance URL so visitors never see the application behind the lock.
  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Witryna jest zablokowana. Wprowadź hasło na stronie konserwacji, aby kontynuować.', site_locked: true }), {
      status: 423,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  if (!isMaintenancePage) {
    return Response.redirect(new URL('/maintenance', url).toString(), 302);
  }

  const esc = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));
  const message = esc(values.maintenance_message || 'Witryna jest tymczasowo chroniona hasłem. Wprowadź hasło, aby kontynuować.');
  const until = values.maintenance_until ? `<p>Planowane zakończenie: ${esc(values.maintenance_until.replace('T',' ').slice(0,16))}</p>` : '';
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>System Formy — prace konserwacyjne</title><style>
  :root{color-scheme:dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#10120e;color:#f5f5f0}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(ellipse at top,#252b1c 0%,#10120e 60%)}main{width:min(460px,100%);padding:clamp(24px,6vw,38px);border:1px solid #383d31;border-radius:20px;background:#191c16;box-shadow:0 24px 80px #0006}.brand{display:flex;align-items:center;gap:10px;color:#c5f36b;font-size:12px;letter-spacing:2px;font-weight:800}.mark{display:grid;place-items:center;width:36px;height:36px;border-radius:9px;background:#c5f36b;color:#11170a;font-weight:900;letter-spacing:0}h1{font-size:clamp(26px,6vw,34px);line-height:1.1;margin:28px 0 12px}p{color:#b9bdb1;line-height:1.65;margin:10px 0 20px}label{display:block;font-size:13px;font-weight:650;margin-bottom:7px}input,button{width:100%;padding:14px;border-radius:10px;font:inherit}input{background:#10120e;border:1px solid #4a5042;color:#fff;margin:0 0 12px}input:focus{outline:2px solid #c5f36b;outline-offset:2px}button{border:0;background:#c5f36b;color:#11170a;font-weight:800;cursor:pointer}button:disabled{opacity:.6;cursor:wait}#err{color:#ffb1a7;min-height:24px;margin:10px 0 0;font-size:13px}.admin{display:block;text-align:center;margin-top:20px;padding:12px;border:1px solid #59614e;border-radius:10px;color:#f5f5f0;text-decoration:none;font-size:14px}.admin:hover{border-color:#c5f36b}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style></head><body><main><div class="brand"><span class="mark">SF</span><span>SYSTEM FORMY</span></div><h1>Trwają prace konserwacyjne</h1><p>${message}</p>${until}<form id="f"><label for="p">Hasło dostępu</label><input id="p" type="password" autocomplete="current-password" required autofocus maxlength="200"><button id="submit">Odblokuj witrynę</button><p id="err" role="alert" aria-live="polite"></p></form><a class="admin" href="/login?next=%2Facp">Jesteś administratorem? Zaloguj się do ACP</a></main><script>const form=document.getElementById('f'),err=document.getElementById('err'),button=document.getElementById('submit');form.addEventListener('submit',async e=>{e.preventDefault();err.textContent='';button.disabled=true;button.textContent='Sprawdzam…';try{const r=await fetch('/api/v2/site-lock/unlock',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({password:document.getElementById('p').value})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Nie udało się odblokować witryny.');location.replace('/')}catch(x){err.textContent=x instanceof Error?x.message:'Błąd połączenia.'}finally{button.disabled=false;button.textContent='Odblokuj witrynę'}});</script></body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
}

async function verifySiteUnlockToken(storedHash: string, token: string): Promise<boolean> {
  const [expiresRaw, signature, extra] = token.split('.');
  if (!expiresRaw || !signature || extra !== undefined || !/^\d{10,13}$/.test(expiresRaw) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expires = Number(expiresRaw);
  if (!Number.isSafeInteger(expires) || expires <= Date.now() || expires > Date.now() + 24 * 60 * 60 * 1000 + 60_000) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(storedHash), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`system-formy-site-unlock:${expiresRaw}`));
  const hex = Array.from(new Uint8Array(expected), b => b.toString(16).padStart(2,'0')).join('');
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
