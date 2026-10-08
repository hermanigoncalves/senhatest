// Variáveis fictícias para os testes em Node: o cliente Supabase não tem mais fallback para o CMIPtst.
// Nenhum teste deste arquivo faz rede; os que usam o cliente substituem os métodos por mocks.
process.env.VITE_SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||= 'test-publishable-key';
