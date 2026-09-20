import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isValidCpf, formatTicket } from './src/utils/validation.js';
assert.equal(formatTicket(150),'0150');
assert.equal(formatTicket(1000),'1000');
assert.equal(isValidCpf('529.982.247-25'),true);
assert.equal(isValidCpf('111.111.111-11'),false);
assert.equal(isValidCpf('529.982.247-24'),false);
import { classifyProfile } from './src/utils/profile.js';
assert.equal(classifyProfile(null),'missing');
assert.equal(classifyProfile({active:false,must_change_password:false,role:'doctor'}),'inactive');
assert.equal(classifyProfile({active:true,must_change_password:true,role:'doctor'}),'password_change');
assert.equal(classifyProfile({active:true,must_change_password:false,role:'doctor'}),'ready');
assert.equal(classifyProfile({active:true,must_change_password:false,role:'master'}),'ready');
const tvSource = fs.readFileSync(new URL('./src/components/V1TvPanel.jsx', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('./src/utils/cmipApi.js', import.meta.url), 'utf8');
assert(tvSource.includes('ATIVAR PAINEL'), 'TV deve exigir ativação explícita para desbloquear mídia');
assert(tvSource.includes('announceTicket'), 'TV deve reutilizar o motor de áudio comprovado do sistema antigo');
assert(apiSource.includes("table:'display_panels'"), 'TV deve usar sinal Realtime do display, sem expor eventos públicos brutos');
assert(apiSource.includes('list_active_display_panels'), 'Login deve carregar displays ativos dinamicamente');

console.log('V1 unit tests: OK');

// TV compatibility regression: server-side TTS from the proven legacy implementation must remain primary.
{
  const audio = fs.readFileSync(new URL('./src/utils/audio.js', import.meta.url), 'utf8');
  assert(audio.includes("/api/tts?text="), 'TV audio must use /api/tts server-side voice first');
  assert(audio.includes('speakTicketViaEndpoint'), 'legacy endpoint TTS path must exist');
  assert(audio.includes('speakTicketNative'), 'native speech must remain fallback');
  const vite = fs.readFileSync(new URL('./vite.config.js', import.meta.url), 'utf8');
  assert(vite.includes("cmip-tts-dev"), 'Vite LAN dev must expose TTS without a second server process');
}

// Doctor availability / reception UX regressions.
{
  const app = fs.readFileSync(new URL('./src/V1App.jsx', import.meta.url), 'utf8');
  assert(apiSource.includes("list_available_doctors"), 'Reception must use reduced doctor availability RPC');
  assert(apiSource.includes("get_my_doctor_session"), 'Doctor UI must load its active session explicitly');
  assert(app.includes('Online •'), 'Doctor must show visible online/session state');
  assert(app.includes('+ Cadastrar paciente'), 'Reception must expose patient registration as an action');
  assert(app.includes('Cadastrar paciente'), 'Patient registration modal must exist');
  assert(app.includes('Paciente selecionado'), 'Reception must show selected patient summary');
  assert(app.includes('Nenhum médico disponível no momento.'), 'Reception must show empty doctor availability state');
}


// Doctor presence regression: availability requires heartbeat and reception re-evaluates timeout.
{
  const app = fs.readFileSync(new URL('./src/V1App.jsx', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('./src/utils/cmipApi.js', import.meta.url), 'utf8');
  assert(api.includes("doctor_heartbeat"), 'Doctor frontend must send authenticated heartbeat');
  assert(api.includes("end_doctor_session"), 'Doctor logout must end active medical session');
  assert(app.includes('setInterval(beat,15000)'), 'Doctor heartbeat interval must be 15 seconds');
  assert(app.includes('setInterval(loadDoctors,15000)'), 'Reception must periodically re-evaluate doctor presence');
  assert(app.includes("profile.role==='doctor'"), 'Shell logout must use doctor-specific immediate session shutdown');
}
