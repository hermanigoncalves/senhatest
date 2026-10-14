# Voz nas TVs com Fully Kiosk Browser — 2026-10-14

## Problema

Nas TVs que usam o **Fully Kiosk Browser**, a chamada tocava só a campainha: nem a senha nem o nome eram falados.
Nas TVs com outro navegador tudo funcionava.

## Causa

O Fully roda num Android WebView, que **não tem voz** no `speechSynthesis` do navegador.

- **Nome do paciente:** por política de privacidade (`ttsPolicy.js`), só pode ser falado pela voz do próprio
  aparelho. Sem voz no WebView, `speakTicketNative` terminava em silêncio.
- **Senha:** usa `/api/tts`. Um dos provedores (StreamElements) responde `401` e o outro (Google Translate) pode
  falhar a partir da Vercel. Quando falha, o código cai na voz do aparelho, que no Fully não existe: silêncio.
- A campainha funciona porque é um áudio embutido na página (data URI), sem voz.

## Correção (`src/utils/audio.js`)

Quando a página roda no Fully com a JavaScript Interface ativa (`window.fully.textToSpeech` existe), a TV fala
**senha e nome** pelo motor de voz do Android (`fully.textToSpeech(texto, 'pt-BR')`), no próprio aparelho.
O nome do paciente continua sem sair da TV.

- O fim da fala vem do evento `ttsUtteranceDone` do Fully (registrado uma vez com `fully.bind`), para a próxima
  chamada não cortar a anterior. Sem eventos, a espera é estimada pelo tamanho da frase.
- Evento `ttsUtteranceDone` atrasado de uma fala anterior é ignorado (só vale depois do `ttsUtteranceStart`).
- Erro do motor de voz (`ttsUtteranceError`) cai nos caminhos antigos (voz online para senha).
- Tempo máximo de 18 s, abaixo do limite de 20 s da fila da TV. Ao estourar, não repete a fala.
- Versões antigas do Fully que só aceitam `textToSpeech(texto)` continuam funcionando.
- No Fully, a TV não pré-carrega mais o `/api/tts`.
- **TVs sem Fully: nenhuma mudança** (o novo caminho só é usado quando `window.fully.textToSpeech` existe).

## Verificação

- `npm test`: 24 grupos OK (6 novos para o Fully).
- `npm run lint`, Prettier e `vite build`: OK.
- Playwright: 22 testes passaram (16 ignorados são os E2E reais opt-in), incluindo 2 novos que simulam o Fully na
  tela da TV: chamada médica e chamada de senha falam pelo Fully, nenhuma frase vai ao `/api/tts` e o vídeo
  institucional volta depois da fala.
- **Não testado em TV real.** Validar depois do deploy (checklist abaixo).

## Configuração em cada TV com Fully (obrigatória)

1. Fully → *Settings → Advanced Web Settings* → **Enable JavaScript Interface (PLUS)** ligado.
   Requer licença Fully PLUS. Sem isso, a TV continua só com a campainha.
2. Android → *Configurações → Saída de texto para fala*: motor **Google**, idioma **Português (Brasil)**, voz
   baixada para uso offline.
3. Se a voz sair baixa: Fully → *Device Management → Set Volume Levels (PLUS)*, stream **9 (TTS)**.
4. Recarregar a página da TV no Fully depois do deploy.

## Teste na TV depois do deploy

1. Abrir `/tv/<código>` no Fully e apertar OK no controle.
2. Chamar uma **senha** → deve falar "Senha N. Guichê X.".
3. Fazer uma **chamada médica** → deve falar "Atenção. Paciente <nome>, dirigir-se ao/à <local>.".
4. Fazer duas chamadas seguidas → a segunda não pode cortar a primeira.
5. Repetir a chamada médica numa TV **sem** Fully → deve continuar igual a antes.
