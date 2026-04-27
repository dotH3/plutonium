import { queryLLM } from "./llm";
import { browserManager } from './browser-manager';
import { ProductosResponseSchema, ProductoTiendaSchema } from './schema';

const SYSTEM_PROMPT = `Eres un extractor de datos especializado en menús de restaurantes.
Analiza el texto proporcionado y extrae los productos con sus precios.
Responde ÚNICAMENTE con un JSON válido y nada más: un array de objetos con formato [{"nombre": "string", "precio": number}].
Si no encuentras productos o precios, devuelve un array vacío [].`;

export interface ScrapeResult {
  productos: Array<{ nombre: string; precio: number }>;
  cost: string;
  time: number;
}

export interface ScrapeProductResult {
  producto: {
    nombre: string;
    precio: number;
    imagen?: string;
    url?: string;
  };
  cost: string;
  time: number;
}

export const scrapeRestaurant = async (url: string): Promise<ScrapeResult> => {
  const startTime = performance.now();
  let page;
  try {
    page = await browserManager.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const snapshot = await page.locator('body').ariaSnapshot();

    const userPrompt = `Extrae los productos y precios del siguiente texto de un menú:\n\n${snapshot}`;
    const { completion, cost } = await queryLLM(userPrompt, SYSTEM_PROMPT);

    const rawContent = completion.choices?.[0]?.message?.content ?? '[]';

    // Extraer JSON del posible markdown
    const firstBracket = rawContent.indexOf('[');
    const lastBracket = rawContent.lastIndexOf(']');
    let jsonString = rawContent;
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      jsonString = rawContent.substring(firstBracket, lastBracket + 1);
    }

    const parsed = JSON.parse(jsonString);
    const productos = ProductosResponseSchema.parse(parsed);

    const time = (performance.now() - startTime) / 1000;
    return { productos, cost, time };
  } catch (error) {
    console.error("Error durante el scraping:", error);
    throw error;
  } finally {
    if (page) {
      await browserManager.closePage(page);
    }
  }
};

async function resolveLocator(page: any, target: string) {
  // Para inputs de búsqueda, probar estrategias comunes
  const strategies = [
    () => page.getByPlaceholder(target).first(),
    () => page.getByLabel(target).first(),
    () => page.getByRole('searchbox', { name: target }).first(),
    () => page.locator(`input[placeholder*="${target}"]`).first(),
    () => page.getByText(target).first(),
  ];

  for (const strategy of strategies) {
    const locator = strategy();
    try {
      const count = await locator.count();
      if (count > 0) return locator;
    } catch {
      // ignorar y probar siguiente estrategia
    }
  }
  return page.getByText(target).first();
}

function extractJson(text: string): string {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1);
  }
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return text.substring(firstBracket, lastBracket + 1);
  }
  return text;
}

const NAV_SYSTEM_PROMPT = `Eres un asistente de navegación web inteligente.
Analiza el snapshot ARIA proporcionado de una tienda online y decide la siguiente acción para encontrar un producto específico.
Responde ÚNICAMENTE con un JSON válido sin markdown en este formato exacto:
{"action": "click" | "fill" | "press" | "wait" | "scrape", "target": "texto exacto o descripción del elemento", "value": "texto a escribir si es fill, o tecla si es press"}

Usa:
- "fill" para escribir en inputs de búsqueda. El target debe ser el texto visible del input o su label.
- "click" para hacer clic en botones, enlaces o elementos clickeables.
- "press" para teclas como "Enter" o "Escape".
- "wait" para esperar carga de página.
- "scrape" cuando la página actual ya muestra la información del producto buscado (nombre, precio, descripción, etc.).`;

const PRODUCT_SYSTEM_PROMPT = `Eres un extractor de datos especializado en productos de e-commerce.
Analiza el texto proporcionado y extrae la información del producto.
Responde ÚNICAMENTE con un JSON válido y nada más con este formato exacto:
{"nombre": "string", "precio": number, "imagen": "string", "url": "string"}
Si no encuentras algún campo, omítelo o usa null/string vacío/0.`;

export const scrapeProduct = async (url: string, productName: string): Promise<ScrapeProductResult> => {
  const startTime = performance.now();
  let page;
  let totalCost = 0;

  try {
    page = await browserManager.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    const maxSteps = 10;
    let scraped = false;

    for (let step = 0; step < maxSteps; step++) {
      await page.waitForTimeout(800);
      const snapshot = await page.locator('body').ariaSnapshot();

      const navUserPrompt = `Producto a buscar: "${productName}"\n\nSnapshot ARIA de la página:\n${snapshot}`;
      const { completion: navCompletion, cost: navCost } = await queryLLM(navUserPrompt, NAV_SYSTEM_PROMPT);
      totalCost += parseFloat(navCost);

      const rawNav = navCompletion.choices?.[0]?.message?.content ?? '{}';
      const navJson = extractJson(rawNav);
      let actionData: { action: string; target?: string; value?: string };
      try {
        actionData = JSON.parse(navJson);
      } catch {
        console.warn('[scrapeProduct] No se pudo parsear la acción del LLM, esperando...');
        await page.waitForTimeout(2000);
        continue;
      }

      console.log(`[scrapeProduct] Paso ${step + 1}: acción=${actionData.action}, target=${actionData.target}`);

      if (actionData.action === 'scrape') {
        scraped = true;
        break;
      }

      try {
        if (actionData.action === 'click') {
          if (actionData.target) {
            const locator = await resolveLocator(page, actionData.target);
            await locator.click();
          }
        } else if (actionData.action === 'fill') {
          if (actionData.target) {
            const locator = await resolveLocator(page, actionData.target);
            await locator.fill(actionData.value ?? '');
          }
        } else if (actionData.action === 'press') {
          await page.keyboard.press(actionData.value || 'Enter');
        } else if (actionData.action === 'wait') {
          await page.waitForTimeout(2000);
        } else {
          await page.waitForTimeout(1500);
        }
      } catch (actionError) {
        console.warn('[scrapeProduct] Error ejecutando acción:', actionError);
        await page.waitForTimeout(1500);
      }

      await page.waitForLoadState('networkidle').catch(() => {});
    }

    if (!scraped) {
      console.warn('[scrapeProduct] Se alcanzó el máximo de pasos sin confirmación de scrape. Intentando scrapear la página actual...');
    }

    const finalSnapshot = await page.locator('body').ariaSnapshot();
    const scrapeUserPrompt = `Producto buscado: "${productName}"\n\n${finalSnapshot}`;
    const { completion: scrapeCompletion, cost: scrapeCost } = await queryLLM(scrapeUserPrompt, PRODUCT_SYSTEM_PROMPT);
    totalCost += parseFloat(scrapeCost);

    const rawScrape = scrapeCompletion.choices?.[0]?.message?.content ?? '{}';
    const scrapeJson = extractJson(rawScrape);
    const parsed = JSON.parse(scrapeJson);

    // Resolver URL relativa a absoluta usando la URL base del sitio
    if (parsed.url && typeof parsed.url === 'string' && !parsed.url.startsWith('http')) {
      try {
        parsed.url = new URL(parsed.url, url).href;
      } catch {
        // si falla, dejar como estaba
      }
    }

    // Si la URL sigue sin ser válida, usar la URL actual del navegador
    if (!parsed.url || typeof parsed.url !== 'string' || !parsed.url.startsWith('http')) {
      try {
        const currentUrl = page.url();
        if (currentUrl && currentUrl.startsWith('http')) {
          parsed.url = currentUrl;
        }
      } catch {
        // ignorar
      }
    }

    // Intentar obtener la imagen real del DOM si el LLM no devolvió una URL válida
    const looksLikeImageUrl = (val: unknown): boolean =>
      typeof val === 'string' &&
      val.startsWith('http') &&
      /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(val);

    if (!looksLikeImageUrl(parsed.imagen)) {
      try {
        const imageFromPage = await page.evaluate(() => {
          // 1. Intentar og:image
          const ogImage = document.querySelector('meta[property="og:image"]');
          if (ogImage) {
            const content = ogImage.getAttribute('content');
            if (content) return content;
          }
          // 2. Buscar imágenes grandes visibles (mayor área)
          const imgs = Array.from(document.querySelectorAll('img'));
          let bestSrc: string | null = null;
          let bestArea = 0;
          for (const img of imgs) {
            const rect = img.getBoundingClientRect();
            const area = rect.width * rect.height;
            if (area > bestArea && img.src && img.src.startsWith('http')) {
              bestArea = area;
              bestSrc = img.src;
            }
          }
          return bestSrc;
        });
        if (imageFromPage) {
          parsed.imagen = imageFromPage;
        }
      } catch {
        // ignorar errores de extracción de imagen
      }
    }

    // Limpiar campos vacíos/null para que Zod los trate como opcionales si es necesario
    if (parsed.imagen === null || parsed.imagen === '') delete parsed.imagen;
    if (parsed.url === null || parsed.url === '') delete parsed.url;

    const producto = ProductoTiendaSchema.parse(parsed);

    const time = (performance.now() - startTime) / 1000;
    return {
      producto,
      cost: totalCost.toLocaleString('en-US', { maximumFractionDigits: 10 }),
      time,
    };
  } catch (error) {
    console.error('Error durante el scraping del producto:', error);
    throw error;
  } finally {
    if (page) {
      await browserManager.closePage(page);
    }
  }
};
