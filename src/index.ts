import { queryLLM } from "./modules/llm";
import { chromium } from 'playwright';
import { ProductosResponseSchema } from './modules/schema';

// const url = 'https://saas.ecomenuapp.com/tienda/clubsocial';
const url = 'https://menu.fu.do/picnicbariloche'

const SYSTEM_PROMPT = `Eres un extractor de datos especializado en menús de restaurantes.
Analiza el texto proporcionado y extrae los productos con sus precios.
Responde ÚNICAMENTE con un JSON válido y nada más: un array de objetos con formato [{"nombre": "string", "precio": number}].
Si no encuentras productos o precios, devuelve un array vacío [].`;

const main = async () => {
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        const text = await page.locator('body').innerText();
        const snapshot = await page.locator('body').ariaSnapshot()

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

        console.log("Productos extraídos:");
        console.log(JSON.stringify(productos, null, 2));
        console.log("Costo estimado USD:", cost);
    } catch (error) {
        console.error("Error durante la ejecución:", error);
    } finally {
        await browser?.close();
    }
};

main();