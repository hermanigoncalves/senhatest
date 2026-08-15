import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://thlyesicurtypzccqxrk.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRobHllc2ljdXJ0eXB6Y2NxeHJrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjcxOTc4NSwiZXhwIjoyMTAyMjk1Nzg1fQ.BY2gHMe8C6x8Du_ySzUw9ci8fOEm40qS9aY4kRBIgbI';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runCheck() {
  console.log('🔍 [FASE 1] Verificando tabelas e colunas no Supabase...');

  const tables = ['offices', 'doctors', 'users', 'patients', 'patient_calls', 'tickets'];
  
  for (const table of tables) {
    try {
      const { data, error } = await supabaseAdmin.from(table).select('*').limit(3);
      if (error) {
        console.log(`❌ Tabela [${table}]: Erro -> ${error.message}`);
      } else {
        console.log(`✅ Tabela [${table}]: Conectada com sucesso (${data.length} registros encontrados).`);
        if (data.length > 0) {
          console.log(`   Colunas detectadas:`, Object.keys(data[0]).join(', '));
          console.log(`   Amostra do 1º registro:`, JSON.stringify(data[0]));
        }
      }
    } catch (err) {
      console.log(`❌ Tabela [${table}]: Falha ->`, err.message);
    }
  }
}

runCheck();
