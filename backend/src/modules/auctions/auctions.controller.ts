import { Request, Response, NextFunction } from 'express';
import * as auctionsService from './auctions.service';

export async function list(req: Request, res: Response, next: NextFunction) {
  try { res.json(await auctionsService.list(req.query as any)); }
  catch (err) { next(err); }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try { res.json({ auction: await auctionsService.getOne(req.params.id) }); }
  catch (err) { next(err); }
}

export async function getBids(req: Request, res: Response, next: NextFunction) {
  try { res.json(await auctionsService.getBids(req.params.id, req.query as any)); }
  catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const auction = await auctionsService.create({ ...req.body, sellerId: req.user!.sub });
    res.status(201).json({ auction });
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const auction = await auctionsService.getOne(req.params.id);
    if (auction.sellerId !== req.user!.sub && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'forbidden', message: 'Only the seller or an admin can update this auction' });
    }
    res.json({ auction: await auctionsService.update(req.params.id, req.body) });
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const auction = await auctionsService.getOne(req.params.id);
    if (auction.sellerId !== req.user!.sub && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'forbidden', message: 'Only the seller or an admin can delete this auction' });
    }
    await auctionsService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
}

// Uses req.user.sub — never a URL param — so one user cannot fetch another's recommendations
export async function getRecommendations(req: Request, res: Response, next: NextFunction) {
  try {
    const recommendations = await auctionsService.getRecommendations(req.user?.sub);
    res.json({ recommendations });
  } catch (err) { next(err); }
}
