import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(422).json({ error: 'Validation failed', errors });
    }
    req.query = result.data as any;
    next();
  };
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(422).json({ error: 'Validation failed', errors });
    }
    req.body = result.data;
    next();
  };
}
