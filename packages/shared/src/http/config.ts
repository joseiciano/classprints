export interface WorkerClientConfig {
  baseUrlEnvKeys: string[];
  localDevPort: number;
  apiPrefix?: string;
}

const defaultWorkerClientConfig: WorkerClientConfig = {
  baseUrlEnvKeys: ['WORKER_BASE_URL', 'API_BASE_URL'],
  localDevPort: 8787,
  apiPrefix: '',
};

let workerClientConfig: WorkerClientConfig = { ...defaultWorkerClientConfig };

export const configureWorkerClient = (config: Partial<WorkerClientConfig>): void => {
  workerClientConfig = { ...workerClientConfig, ...config };
};

export const getWorkerClientConfig = (): WorkerClientConfig => workerClientConfig;
