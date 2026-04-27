import fastify from 'fastify';
import cors from '@fastify/cors';
import { scrapeRestaurant, scrapeProduct } from './modules/scraper';
import { browserManager } from './modules/browser-manager';

const server = fastify({ logger: false });

server.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

server.post('/scrape', async (request, reply) => {
  const { url } = request.body as { url?: string };

  if (!url || typeof url !== 'string') {
    return reply.status(400).send({ error: 'Se requiere una URL válida en el body' });
  }

  try {
    const result = await scrapeRestaurant(url);
    return reply.send(result);
  } catch (error) {
    server.log.error(error);
    return reply.status(500).send({ error: 'Error al procesar la URL' });
  }
});

server.post('/scrape-product', async (request, reply) => {
  const { url, productName } = request.body as { url?: string; productName?: string };

  if (!url || typeof url !== 'string') {
    return reply.status(400).send({ error: 'Se requiere una URL válida en el body' });
  }
  if (!productName || typeof productName !== 'string') {
    return reply.status(400).send({ error: 'Se requiere un productName válido en el body' });
  }

  try {
    const result = await scrapeProduct(url, productName);
    return reply.send(result);
  } catch (error) {
    server.log.error(error);
    return reply.status(500).send({ error: 'Error al procesar la búsqueda del producto' });
  }
});

const start = async () => {
  try {
    await browserManager.init();
    await server.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Servidor escuchando en http://localhost:3000');
  } catch (err) {
    server.log.error(err);
    await browserManager.shutdown();
    process.exit(1);
  }
};

start();

// Cierre limpio al recibir señales de terminación
process.on('SIGTERM', async () => {
  console.log('SIGTERM recibido, cerrando browser...');
  await browserManager.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT recibido, cerrando browser...');
  await browserManager.shutdown();
  process.exit(0);
});
