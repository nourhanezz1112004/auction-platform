import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middlewares/validate.middleware';
import { requireAuth } from '../../middlewares/auth.middleware';
import { PlaceBidSchema, BidQuerySchema } from '@auction/shared-types';
import * as c from './bids.controller';

const bidLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 bids per minute cap
  message: { error: 'too_many_requests', message: 'Rate limit exceeded. Please wait before bidding again.' }
});

export const bidsRouter = Router();

bidsRouter.post('/',    requireAuth, bidLimiter, validate({ body: PlaceBidSchema }),   c.place);
bidsRouter.get ('/my',  requireAuth, validate({ query: BidQuerySchema }),  c.myBids);
