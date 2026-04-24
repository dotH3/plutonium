import { z } from 'zod';

export const ProductoSchema = z.object({
  nombre: z.string().min(1),
  precio: z.number().nonnegative(),
});

export const ProductosResponseSchema = z.array(ProductoSchema);

export type Producto = z.infer<typeof ProductoSchema>;
