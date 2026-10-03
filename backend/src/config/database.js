import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

export async function connectDatabase() {
  mongoose.connection.on('connected', () => logger.info('MongoDB conectado'));
  mongoose.connection.on('error', (err) => logger.error('Erro de conexão com o MongoDB', err));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB desconectado'));

  await mongoose.connect(env.MONGO_URI);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
