// Traduz erros técnicos para mensagens de tela em português.
export const NETWORK_ERROR_MSG =
  'Sem internet neste aparelho. Verifique o Wi-Fi ou os dados móveis e tente de novo.';
export const DUPLICATE_CALL_MSG =
  'Esta senha acabou de ser chamada. Aguarde alguns segundos para chamar de novo.';

// Queda de rede: Chrome escreve "Failed to fetch", Safari "Load failed", Firefox "NetworkError ...".
// O supabase-js repassa como { message: 'TypeError: Failed to fetch' }.
const NETWORK_RE = /Failed to fetch|Load failed|NetworkError|Network request failed/i;

export const isNetworkError = (e) => NETWORK_RE.test(String(e?.message || ''));

export const friendlyError = (e) => {
  if (isNetworkError(e)) return NETWORK_ERROR_MSG;
  const message = e?.message || '';
  // Bloqueio de 2 s no banco contra chamada repetida da mesma senha.
  if (message.includes('Chamada duplicada bloqueada')) return DUPLICATE_CALL_MSG;
  return message || 'Não foi possível concluir a operação.';
};
