import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config';
import { errorHandler, notFound } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import beatsRoutes from './routes/beats';
import brandRoutes from './routes/brand';
import usersRoutes from './routes/users';
import transactionsRoutes from './routes/transactions';
import webhooksRoutes from './routes/webhooks';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
    })
  );
  app.use(morgan('combined'));
  app.use(express.json({ limit: '2mb' }));

  // Serve uploaded audio files.
  app.use('/uploads', express.static(path.resolve(config.uploadDir)));

  // Serve brand assets (logo, mascot, profile, banner) from the repo's brand/.
  app.use('/brand', express.static(config.brandDir));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });
  app.use('/v1', apiLimiter);

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'vbeats-backend', version: '0.1.0' });
  });

  app.use('/v1/auth', authRoutes);
  app.use('/v1/beats', beatsRoutes);
  app.use('/v1/brand', brandRoutes);
  app.use('/v1/users', usersRoutes);
  app.use('/v1/transactions', transactionsRoutes);
  app.use('/v1/webhooks', webhooksRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
