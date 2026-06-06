import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware';
import { requireAuth, optionalAuth } from '../../middlewares/auth.middleware';
import { CreateAuctionSchema, UpdateAuctionSchema, AuctionQuerySchema, BidQuerySchema } from '@auction/shared-types';
import * as c from './auctions.controller';
import { auctionsAiRouter } from './auctions.ai.routes';

export const auctionsRouter = Router();

// ─── AI Intelligence sub-router ───────────────────────────────────────────────
auctionsRouter.use('/ai', auctionsAiRouter);

auctionsRouter.get('/recommendations', optionalAuth,                            c.getRecommendations);
auctionsRouter.get('/recommendations/:userId', optionalAuth,                    c.getRecommendations);
auctionsRouter.get('/',                        validate({ query: AuctionQuerySchema }), c.list);
auctionsRouter.get('/:id',                     c.getOne);
auctionsRouter.get('/:id/bids',                validate({ query: BidQuerySchema }),     c.getBids);
auctionsRouter.post('/',                       requireAuth, validate({ body: CreateAuctionSchema }), c.create);
auctionsRouter.patch('/:id',                   requireAuth, validate({ body: UpdateAuctionSchema }), c.update);
auctionsRouter.delete('/:id',                  requireAuth, c.remove);

