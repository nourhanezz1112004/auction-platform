import { z } from 'zod';

// ─── Zod Schemas ───────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name:     z.string().min(1),
  phone:    z.string().optional(),
});

export const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export const UpdateUserSchema = z.object({
  name:  z.string().min(1).optional(),
  phone: z.string().optional(),
  bio:   z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

// ─── Inferred Types ────────────────────────────────────────────────────────────

export type RegisterRequest  = z.infer<typeof RegisterSchema>;
export type LoginRequest     = z.infer<typeof LoginSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserSchema>;

// ─── Response Shapes ──────────────────────────────────────────────────────────

export interface User {
  id:        string;
  email:     string;
  name:      string;
  phone:     string | null;
  bio:       string | null;
  avatarUrl: string | null;
  rating:    number;
  abGroup:   'a' | 'b';
  createdAt: string;
}

export interface AuthResponse {
  user:         User;
  accessToken:  string;
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}
