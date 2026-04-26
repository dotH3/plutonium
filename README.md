# Plutonium

Scrapea menús de restaurantes usando Playwright + LLM.

## Setup

```bash
bun install
```

Crea un `.env`:

```env
OPENROUTER_API_KEY=tu-api-key
```

## Uso

```bash
bun run dev     # modo watch
bun run build   # compilar
```

Cambia la URL en `src/index.ts` y ejecuta `bun run src/index.ts`.

## Output

```json
[
  { "nombre": "Hamburguesa", "precio": 12500 }
]
```

## Stack

Bun, Playwright, OpenRouter, Zod
