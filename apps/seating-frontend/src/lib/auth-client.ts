import { createSessionClient, type SessionClient } from '@classprints/shared/auth';
import { seatingWorkerFetcher } from './http';

let sessionClient: SessionClient | null = null;

export const getAuthSessionClient = (): SessionClient => {
  if (!sessionClient) {
    sessionClient = createSessionClient({ fetcher: seatingWorkerFetcher });
  }
  return sessionClient;
};
