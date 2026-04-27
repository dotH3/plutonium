import { z } from 'zod';

export const ProductoSchema = z.object({
  nombre: z.string().min(1),
  precio: z.number().nonnegative(),
});

export const ProductosResponseSchema = z.array(ProductoSchema);

export const ProductoTiendaSchema = z.object({
  nombre: z.string().min(1),
  precio: z.number().nonnegative(),
  imagen: z.string().optional(),
  url: z.string().optional(),
});

export type Producto = z.infer<typeof ProductoSchema>;
export type ProductoTienda = z.infer<typeof ProductoTiendaSchema>;
