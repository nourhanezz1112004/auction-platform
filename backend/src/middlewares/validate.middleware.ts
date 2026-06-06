import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Usage:
 *   router.post('/bids', validate({ body: PlaceBidSchema }), bidsController.place);
 *   router.get('/auctions', validate({ query: AuctionQuerySchema }), auctionsController.list);
 */
export function validate(schemas: {
  body?:  ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body)   req.body   = schemas.body.parse(req.body);
      if (schemas.query)  req.query  = schemas.query.parse(req.query) as any;
      if (schemas.params) req.params = schemas.params.parse(req.params) as any;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(422).json({
          error:   'validation_error',
          message: 'Request validation failed',
          issues:  err.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
        });
        return;
      }
      next(err);
    }
  };
}
