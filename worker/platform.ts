interface PlatformEnv { DB: D1Database; PRODUCT_FILES?: R2Bucket; ADMIN_EMAIL?: string; }
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
export async function handlePlatformApi(request:Request,env:PlatformEnv):Promise<Response|null>{
 const path=new URL(request.url).pathname,method=request.method.toUpperCase();
 if(badOrigin(request))return reply({error:'Żądanie pochodzi z nieprawidłowej strony.'},403);
 try{
  if(path==='/api/products'&&method==='GET'){
   const rows=await env.DB.prepare('SELECT id,product_key,title,description,product_type,price_amount,currency,is_free,is_published,checkout_url,created_at FROM products WHERE is_published=1 ORDER BY created_at DESC').all();return reply({products:rows.results});
  }
  if(path==='/api/admin/me'&&method==='GET'){const s=await sessionFor(request,env);return reply({isAdmin:isAdmin(s,env)});}
  if(path==='/api/admin/products'&&method==='GET'){
   const g=await adminGate(request,env);if(g.response)return g.response;
   const rows=await env.DB.prepare('SELECT id,product_key,title,description,product_type,price_amount,currency,is_free,is_published,checkout_url,original_filename,created_at FROM products ORDER BY created_at DESC').all();return reply({products:rows.results});
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
   const f=await request.formData(),title=String(f.get('title')||'').trim(),key=String(f.get('product_key')||'').trim().toLowerCase(),description=String(f.get('description')||'').trim(),type=String(f.get('product_type')||'ebook'),free=String(f.get('is_free')||'')==='true',published=String(f.get('is_published')||'')==='true',price=Number(f.get('price_amount')||0),checkout=String(f.get('checkout_url')||'').trim(),file=f.get('file');
   if(title.length<2||title.length>140)return reply({error:'Nazwa produktu musi mieć 2–140 znaków.'},400);
   if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)||key.length>100)return reply({error:'Klucz produktu używa małych liter, cyfr i myślników, np. zacznij-trenowac.'},400);
   if(description.length<2||description.length>2000)return reply({error:'Opis musi mieć 2–2000 znaków.'},400);
   if(!['ebook','training_plan','guide','bundle','other'].includes(type))return reply({error:'Nieprawidłowy typ produktu.'},400);
   if(!free&&(!Number.isFinite(price)||price<=0||price>100000))return reply({error:'Cena płatnego produktu musi być większa od zera.'},400);
   if(checkout){try{if(new URL(checkout).protocol!=='https:')throw new Error();}catch{return reply({error:'Link zakupu musi być prawidłowym adresem HTTPS.'},400);}}
   if(!(file instanceof File)||!file.size||file.size>MAX_FILE_BYTES)return reply({error:'Wybierz plik o rozmiarze do 25 MB.'},400);
   if(!/\.(pdf|xlsx|docx|zip|csv|txt)$/i.test(file.name))return reply({error:'Dozwolone formaty: PDF, XLSX, DOCX, ZIP, CSV i TXT.'},400);
   if(await product(env,key))return reply({error:'Produkt o takim kluczu już istnieje. Użyj innego klucza.'},409);
   const fileKey='products/'+crypto.randomUUID()+'/'+safeFileName(file.name),contentType=file.type||'application/octet-stream';
   await env.PRODUCT_FILES.put(fileKey,await file.arrayBuffer(),{httpMetadata:{contentType,cacheControl:'private, no-store'}});
   const id=crypto.randomUUID(),now=new Date().toISOString();
   try{await env.DB.prepare('INSERT INTO products (id,product_key,title,description,product_type,price_amount,currency,is_free,is_published,checkout_url,file_key,original_filename,file_content_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,key,title,description,type,free?0:price,'PLN',free?1:0,published?1:0,checkout||null,fileKey,file.name,contentType,now,now).run();}
   catch(err){await env.PRODUCT_FILES.delete(fileKey);throw err;}
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
