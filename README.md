# Sendeskill Dev Deck

Plugin de Stream Deck (SDK v3 da Elgato) com duas ações:

- **Próxima reunião**: mostra a próxima reunião de um calendário ICS (Outlook publicado). Pisca em vermelho nos 10 minutos antes. Ao apertar, traz o Outlook (novo) para frente ou o inicia.
- **Claude terminou**: pisca quando uma sessão do Claude Code termina. Ao apertar, abre o VS Code na pasta da sessão.

## Requisitos

- Windows, Stream Deck 7.1+, Node.js 20+
- Outlook novo (`Microsoft.OutlookForWindows`) e VS Code, para as ações de clique

## Build e instalação

```bash
npm install
npm run build
npx streamdeck link com.sendeskill.devdeck.sdPlugin
```

Reinicie o app do Stream Deck para ele descobrir o plugin. Depois de mudanças no código, rode `npm run build` e encerre o processo `node.exe` do plugin; o Stream Deck o reinicia com o código novo.

## Configuração

**Próxima reunião**: cole o link ICS nas configurações da tecla (Outlook web > Configurações > Calendário > Calendários compartilhados > Publicar um calendário). Escolha "Pode exibir todos os detalhes" para ver os títulos. O link dá acesso de leitura à agenda; não o versione.

**Claude terminou**: adicione um hook `Stop` no `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node \"C:/Projects/streamdeck-sendeskill/hooks/claude-stop.mjs\"", "timeout": 10 }] }
    ]
  }
}
```

O hook grava `%LOCALAPPDATA%\sendeskill-devdeck\claude-done.json`, que o plugin observa.
