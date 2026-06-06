import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { NotFoundError, ForbiddenError } from '../../middlewares/error.middleware';

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      // Omit email and phone from public profiles — these are PII
      select: { id: true, name: true, bio: true, avatarUrl: true, rating: true, abGroup: true, createdAt: true, isAdmin: true },
    });
    if (!user) throw new NotFoundError('User not found');
    res.json({ user });
  } catch (err) { next(err); }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    // Only the account owner or an admin may update a user profile
    if (req.params.id !== req.user!.sub && !req.user!.isAdmin) {
      throw new ForbiddenError('forbidden', 'You can only update your own profile');
    }
    const { name, phone, bio, avatarUrl } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data:  { name, phone, bio, avatarUrl },
      select: { id: true, email: true, name: true, phone: true, bio: true, avatarUrl: true, rating: true, abGroup: true, createdAt: true, isAdmin: true },
    });
    res.json({ user: { ...user, role: user.isAdmin ? 'ADMIN' : 'USER' } });
  } catch (err) { next(err); }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.user!.sub, deletedAt: null },
      select: { id: true, email: true, name: true, phone: true, bio: true, avatarUrl: true, rating: true, abGroup: true, createdAt: true, isAdmin: true },
    });
    if (!user) throw new NotFoundError('User not found');
    res.json({ user: { ...user, role: user.isAdmin ? 'ADMIN' : 'USER' } });
  } catch (err) { next(err); }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, phone, bio, avatarUrl } = req.body;
    // Guard: ensure the user still exists and is not soft-deleted
    const existing = await prisma.user.findFirst({ where: { id: req.user!.sub, deletedAt: null } });
    if (!existing) return res.status(401).json({ error: 'unauthorized', message: 'Account not found' });

    const user = await prisma.user.update({
      where: { id: req.user!.sub },
      data:  { name, phone, bio, avatarUrl },
      select: { id: true, email: true, name: true, phone: true, bio: true, avatarUrl: true, rating: true, abGroup: true, createdAt: true, isAdmin: true },
    });
    res.json({ user: { ...user, role: user.isAdmin ? 'ADMIN' : 'USER' } });
  } catch (err) { next(err); }
}
