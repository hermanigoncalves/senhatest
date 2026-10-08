# CMIP Chamador

Sistema de senhas e fila de atendimento (recepção, médicos, administração e TVs) em React + Vite, com Supabase
(Auth, Postgres/RPC, Realtime e Edge Functions) e deploy na Vercel.

## Desenvolvimento

```bash
npm ci
cp .env.example .env.local   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                  # http://localhost:5173
```

Não existe mais fallback automático para o projeto de teste: sem as variáveis, o `npm run build` falha e o
`npm run dev` mostra uma mensagem de configuração ausente.

| Comando | O que faz |
|---|---|
| `npm run check` | lint + testes + build (rode antes de publicar) |
| `npm test` | testes unitários e de lógica (Node, sem rede) |
| `npm run lint` | ESLint (identificadores indefinidos, hooks) |
| `npm run test:e2e` | Playwright com Supabase simulado (constrói com variáveis fictícias) |
| `npm run format` | Prettier |
| `supabase/tests/run_local.sh` | testa as migrations de revisão num Postgres local descartável |

Para o Playwright usar um Chromium já instalado: `PLAYWRIGHT_CHROMIUM_PATH=/caminho/do/chrome npm run test:e2e`.
Os testes contra o Supabase real (`E2E_REAL=1`) são opt-in e usam credenciais só por variáveis de ambiente.

## Estrutura

```
src/V1App.jsx            roteamento por perfil (login, troca de senha, módulos)
src/components/          telas: Login, Reception, TicketCaller, Doctor, Admin, SuperuserWorkspace, V1TvPanel…
src/utils/               cmipApi (RPC/Edge), audio (campainha + voz), ttsPolicy, tvEvents, ticker, rotas…
api/tts.js               função serverless de TTS (somente frases de senha numérica)
supabase/migrations/     SQL versionado (aplicar primeiro no CMIPtst)
supabase/functions/      Edge Function master-user-admin
tests/e2e/               Playwright
```

## TV (painel público)

- `/tv/<codigo>` é público por decisão do CMIP (sem login). O estado vem de `get_public_display_state`,
  com o nome do paciente abreviado no servidor.
- Navegadores só liberam áudio após um gesto. O painel ativa sozinho se o navegador permitir (ex.: Chrome em modo
  quiosque com `--autoplay-policy=no-user-gesture-required`); caso contrário, qualquer toque ou tecla do controle
  remoto ativa o painel.
- **Nomes de pacientes nunca são enviados a serviços externos de voz.** Chamadas médicas são faladas só pela voz
  instalada no aparelho; se a TV não tiver voz local em português, toca apenas a campainha. Senhas numéricas
  usam `/api/tts`. A política está em `src/utils/ttsPolicy.js` e é aplicada também no servidor.
- Para depurar latência: `localStorage.setItem('cmip_debug', 'true')`.

## Redefinição de senha

A redefinição administrativa define a senha padrão `CMIP123456` e exige a troca no próximo acesso (decisão do CMIP).
A senha padrão fica em um único lugar: `DEFAULT_TEMP_PASSWORD` em `src/utils/cmipApi.js`. O Admin vê a senha
definida no modal de confirmação.

## Publicação

Veja `REVISAO_20261008.md` para a ordem segura: migration no CMIPtst → Edge Function → frontend na Vercel.
