-- READ-ONLY. Execute only after visually confirming the project name CMIPtst.
select current_database(), current_user, current_setting('request.jwt.claims', true);
select table_name from information_schema.tables where table_schema='public' order by 1;
select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by 1,ordinal_position;
select conrelid::regclass table_name,conname,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='public'::regnamespace order by 1,2;
select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname='public' order by 2,3;
select n.nspname schema_name,p.proname,pg_get_function_identity_arguments(p.oid) arguments,prosecdef security_definer,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 2;
select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' order by 1,2,3;
select schemaname,tablename,rowsecurity from pg_tables where schemaname='public' order by 2;
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by 2,3;
select event_object_table,trigger_name,event_manipulation,action_statement from information_schema.triggers where trigger_schema='public' order by 1,2;
