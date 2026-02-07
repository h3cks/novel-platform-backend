import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import profileRoutes from './routes/profile.routes';
import novelRoutes from './routes/novel.routes';
import chapterRoutes from './routes/chapter.routes';
import commentRoutes from './routes/comment.routes';
import reportsRouter from './routes/report.routes';
import metaRouter from './routes/meta.routes';
import { errorHandler } from './middlewares/errorHandler';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/novels', novelRoutes);
app.use('/', chapterRoutes);
app.use('/', commentRoutes);
app.use('/reports', reportsRouter);
app.use('/api', metaRouter);
app.use(errorHandler);

export default app;
