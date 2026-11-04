// Política do TTS online (/api/tts). Usada pelo navegador, pelo servidor da Vercel e pelo servidor de desenvolvimento.
//
// Somente frases de senha numérica podem sair do aparelho para um provedor externo.
// Qualquer frase com nome de paciente (dado de saúde ligado a identidade) é falada apenas pela voz local.

export const MAX_TTS_LENGTH = 120;

// "Senha 45. Guichê 1."  |  "Atenção, atendimento preferencial. Senha 45. Guichê 1."
// O nome do local não pode conter ponto (uma segunda frase com nome não passa) nem a palavra "paciente".
const TICKET_PHRASE =
  /^(?:Atenção, atendimento preferencial\. )?Senha \d{1,4}\. (?!.*\bpaciente\b)[A-Za-zÀ-ÿ0-9 ºª°-]{1,30}\.$/i;

// Senha do consultório com nome: "Senha 412. Paciente REGINA HELENA. Consultório 2."
// Decisão do CMIP (04/11/2026): a TV sem voz própria (Fully sem JavaScript Interface) fala o nome pelo TTS
// online. Para voltar a manter o nome só na voz local, troque PATIENT_NAME_ONLINE para false.
export const PATIENT_NAME_ONLINE = true;
const NAMED_TICKET_PHRASE =
  /^(?:Atenção, atendimento preferencial\. )?Senha \d{1,4}\. Paciente [A-Za-zÀ-ÿ' -]{1,60}\. [A-Za-zÀ-ÿ0-9 ºª°-]{1,30}\.$/;

// Teste de disponibilidade feito pela TV.
const PROBE_PHRASE = /^\d{1,4}$/;

export function isRemoteTtsPhraseAllowed(text) {
  const value = String(text ?? '').trim();
  if (!value || value.length > MAX_TTS_LENGTH) return false;
  return (
    TICKET_PHRASE.test(value) ||
    PROBE_PHRASE.test(value) ||
    (PATIENT_NAME_ONLINE && NAMED_TICKET_PHRASE.test(value))
  );
}
