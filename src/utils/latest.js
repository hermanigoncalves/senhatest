// Evita que uma resposta lenta e antiga sobrescreva uma mais nova quando o mesmo carregamento é disparado
// por Realtime, timer e ação do usuário ao mesmo tempo.
export function createLatestGuard() {
  let seq = 0;
  return {
    next: () => ++seq,
    isLatest: (n) => n === seq,
  };
}
