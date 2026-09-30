import { z } from 'zod';

export const signupSchema = z
  .object({
    email: z.string().email().max(255),
    password: z.string().min(8).max(128),
    // Accept either `username` (mobile app) or `name` (demo signup form).
    username: z.string().min(2).max(64).optional(),
    name: z.string().min(2).max(64).optional(),
    wallet: z.string().max(128).optional(),
  })
  .refine((d) => d.username || d.name, {
    message: 'username or name is required',
    path: ['username'],
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// Beat metadata. Accepts both `desc`/`description` and `dur`/`duration`.
export const beatCreateSchema = z.object({
  title: z.string().min(1).max(255),
  genre: z.string().min(1).max(64),
  bpm: z.coerce.number().int().positive().max(999).optional(),
  key: z.string().max(16).optional(),
  price: z.coerce.number().min(0).max(1_000_000),
  desc: z.string().max(2000).optional(),
  description: z.string().max(2000).optional(),
  dur: z.coerce.number().min(0).max(86400).optional(),
  duration: z.coerce.number().min(0).max(86400).optional(),
  audioUrl: z.string().url().max(2048).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  artworkUrl: z.string().url().max(2048).optional(),
  fingerprint: z.string().max(128).optional(),
});

export const beatUpdateSchema = beatCreateSchema.partial();

export const profileUpdateSchema = z.object({
  username: z.string().min(2).max(64).optional(),
  wallet: z.string().max(128).nullable().optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
