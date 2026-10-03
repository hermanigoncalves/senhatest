import { createClient } from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const out=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
 try{
  const auth=req.headers.get('Authorization')||'';
  const url=Deno.env.get('SUPABASE_URL')!;
  const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:ue}=await userClient.auth.getUser();
  if(ue||!user) return out({error:'Authentication required'},401);
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:actor,error:ae}=await admin.from('profiles').select('role,active,must_change_password').eq('id',user.id).maybeSingle();
  if(ae||!actor||!['admin','master'].includes(actor.role)||!actor.active||actor.must_change_password) return out({error:'Admin/Master authorization required'},403);
  const body=await req.json(); const action=body.action;
  if(action==='create'){
   const full_name=String(body.full_name||'').trim(),email=String(body.email||'').trim().toLowerCase(),role=String(body.role||'');
   if(full_name.length<2||!email||!['admin','receptionist','doctor'].includes(role)) return out({error:'Dados inválidos'},400);
   const password=String(body.temporary_password||'');
   if(password.length<8) return out({error:'Senha temporária deve ter ao menos 8 caracteres'},400);
   const {data:created,error:ce}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name,role}});
   if(ce||!created.user) return out({error:ce?.message||'Falha ao criar usuário'},400);
   const uid=created.user.id;
   try{
    const profilePayload:any={id:uid,full_name,role,active:body.active!==false,must_change_password:true,updated_at:new Date().toISOString()};
    if(body.username) profilePayload.username=String(body.username).trim().toLowerCase();
    if(body.display_name) profilePayload.display_name=String(body.display_name).trim();
    const {error:pe}=await admin.from('profiles').upsert(profilePayload);
    if(pe) throw pe;
    if(role==='doctor'){
      const {error:de}=await admin.from('doctors').insert({profile_id:uid,crm:String(body.crm||'').trim()||null,specialty:String(body.specialty||'').trim()||null,active:body.active!==false});
      if(de) throw de;
    }
    return out({id:uid,email,role,must_change_password:true});
   }catch(e){await admin.auth.admin.deleteUser(uid);return out({error:e.message||'Falha ao criar perfil'},400)}
  }
  if(action==='reset_password'){
   const target=String(body.user_id||''),password=String(body.temporary_password||'');
   if(password.length<8) return out({error:'Senha temporária deve ter ao menos 8 caracteres'},400);
   const {data:tp}=await admin.from('profiles').select('role').eq('id',target).maybeSingle();
   if(!tp) return out({error:'Usuário não encontrado'},404);
   if(tp.role==='master' && actor.role!=='master') return out({error:'Admin não pode redefinir senha de Master'},403);
   const {error:re}=await admin.auth.admin.updateUserById(target,{password});
   if(re) return out({error:re.message},400);
   const {error:pe}=await admin.from('profiles').update({must_change_password:true,updated_at:new Date().toISOString()}).eq('id',target);
   if(pe) return out({error:pe.message},400);
   return out({ok:true});
  }
  return out({error:'Ação inválida'},400);
 }catch(e){return out({error:e?.message||'Erro interno'},500)}
});
