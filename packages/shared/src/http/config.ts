export interface WorkerClientConfig {
  baseUrlEnvKeys: string[];
  apiPrefix?: string;
}

const defaultWorkerClientConfig: WorkerClientConfig = {
  baseUrlEnvKeys: ['WORKER_BASE_URL', 'API_BASE_URL'],
  apiPrefix: '',
};

let workerClientConfig: WorkerClientConfig = { ...defaultWorkerClientConfig };

export const configureWorkerClient = (config: Partial<WorkerClientConfig>): void => {
  workerClientConfig = { ...workerClientConfig, ...config };
};

export const getWorkerClientConfig = (): WorkerClientConfig => workerClientConfig;
