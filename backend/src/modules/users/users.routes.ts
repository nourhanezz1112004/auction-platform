import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware';
import { requireAuth } from '../../middlewares/auth.middleware';
import { UpdateUserSchema } from '@auction/shared-types';
import * as c from './users.controller';

export const usersRouter = Router();

// /me routes MUST come before /:id to avoid "me" being treated as an id
usersRouter.get('/me',    requireAuth, c.getMe);
usersRouter.patch('/me',  requireAuth, validate({ body: UpdateUserSchema }), c.updateMe);
usersRouter.get('/:id',   c.getUser);
usersRouter.patch('/:id', requireAuth, validate({ body: UpdateUserSchema }), c.updateUser);
