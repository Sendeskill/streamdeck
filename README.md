# Sendeskill Dev Deck

Plugin de Stream Deck (SDK v3 da Elgato) com estas ações:

- **Próxima reunião**: mostra a próxima reunião de um calendário ICS (Outlook publicado). Pisca em vermelho nos 10 minutos antes. Ao apertar, traz o Outlook (novo) para frente ou o inicia.
- **Claude terminou**: pisca quando uma sessão do Claude Code termina. Ao apertar, abre o VS Code na pasta da sessão.
- **Claude Mineiro**: um anão minerando enquanto o Claude Code roda (alterna dois golpes a cada ~3 s), que cai quando ele termina e fica parado depois que você aperta a tecla (abre o VS Code).
- **Olho**: olho de demônio ou dragão renderizado em 3D que segue o cursor, pisca e dorme quando o mouse fica parado.

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

**Claude terminou / Claude Mineiro**: adicione os hooks no `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node \"C:/Projects/streamdeck-sendeskill/hooks/claude-state.mjs\" running", "timeout": 10 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node \"C:/Projects/streamdeck-sendeskill/hooks/claude-state.mjs\" done", "timeout": 10 }] }
    ]
  }
}
```

Os hooks gravam `%LOCALAPPDATA%\sendeskill-devdeck\claude-state.json` (`running`, `done` ou `idle`), que o plugin observa.

**Sprites do mineiro**: `scripts/split-miner.py` (requer Pillow) separa `src/assets/miner.gif` em um GIF transparente por animação (`src/assets/miners/`) e gera os quadros 144×144 das teclas (`com.sendeskill.devdeck.sdPlugin/imgs/miner/`).
