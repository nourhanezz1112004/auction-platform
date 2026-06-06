import { Router, Request, Response, NextFunction } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';

import { requireAuth } from '../../middlewares/auth.middleware';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../middlewares/error.middleware';
import { prisma } from '../../lib/prisma';

// ─── Cloudinary configuration ─────────────────────────────────────────────────

if (!process.env.CLOUDINARY_CLOUD_NAME && process.env.NODE_ENV !== 'test') {
  console.warn('[media.routes] CLOUDINARY_* env vars not set — uploads will fail');
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? '',
  api_key:    process.env.CLOUDINARY_API_KEY    ?? '',
  api_secret: process.env.CLOUDINARY_API_SECRET ?? '',
});

const MAX_IMAGES_PER_AUCTION = 10;

// ─── Multer — memory storage only, never write to disk ───────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB hard cap
  },
  fileFilter(_req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      cb(new BadRequestError('invalid_file_type', 'Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});



// ─── Helper: stream a Buffer into Cloudinary ─────────────────────────────────

function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload returned no result'));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const mediaRouter = Router();

// ─── POST /media/upload ───────────────────────────────────────────────────────
//  Requires auth.
//  Accepts multipart/form-data with:
//    file      — the image binary
//    auctionId — UUID of the auction to attach the image to
//  Returns { url, publicId }.

mediaRouter.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    console.log('[media] hit /upload');
    try {
      // ── Validate inputs ───────────────────────────────────────────────────

      if (!req.file) {
        return next(new BadRequestError('missing_file', 'A file field is required'));
      }

      const { auctionId } = req.body as { auctionId?: string };

      if (!auctionId) {
        return next(new BadRequestError('missing_auction_id', 'auctionId is required'));
      }

      // ── Verify the auction exists and belongs to the requester ────────────

      const auction = await prisma.auction.findUnique({
        where: { id: auctionId },
      });

      if (!auction || auction.deletedAt !== null) {
        return next(new NotFoundError('Auction not found'));
      }

      if (auction.sellerId !== req.user!.sub) {
        return next(new ForbiddenError('unauthorized', 'You are not the owner of this auction'));
      }

      // Only allow uploads to DRAFT or ACTIVE auctions
      if (auction.status === 'ENDED' || auction.status === 'CANCELLED') {
        return next(new BadRequestError('auction_closed', 'Cannot upload images to a closed auction'));
      }

      // Enforce maximum image count
      if ((auction.imageUrls ?? []).length >= MAX_IMAGES_PER_AUCTION) {
        return next(new BadRequestError('too_many_images', `Maximum ${MAX_IMAGES_PER_AUCTION} images per auction`));
      }

      // ── Upload buffer to Cloudinary ───────────────────────────────────────

      const { url, publicId } = await uploadToCloudinary(
        req.file.buffer,
        `auction-platform/auctions/${auctionId}`,
      );

      // ── Append URL to the auction's imageUrls array ───────────────────────

      await prisma.auction.update({
        where: { id: auctionId },
        data: {
          imageUrls: {
            push: url,
          },
        },
      });

      res.status(201).json({ url, publicId });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /media/upload-avatar ───────────────────────────────────────────────

mediaRouter.post(
  '/upload-avatar',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    console.log('[media] hit /upload-avatar');
    try {
      if (!req.file) {
        return next(new BadRequestError('missing_file', 'A file field is required'));
      }

      // Upload avatar to Cloudinary
      const { url, publicId } = await uploadToCloudinary(
        req.file.buffer,
        `auction-platform/avatars/${req.user!.sub}`,
      );

      // Save avatar URL to user
      await prisma.user.update({
        where: { id: req.user!.sub },
        data: {
          avatarUrl: url,
        },
      });

      res.status(201).json({
        url,
        publicId,
      });
    } catch (err) {
      next(err);
    }
  },
);
