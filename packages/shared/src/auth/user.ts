import type { AuthUser } from '@classprints/shared';

export interface WorkerAuthUserShape {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  emailNotificationsEnabledAt: string | null;
}

export const mapWorkerUser = (user: WorkerAuthUserShape): AuthUser => ({
  id: user.id,
  email: user.email ?? null,
  emailVerified: user.emailVerified,
  displayName: user.displayName,
  emailNotificationsEnabledAt: user.emailNotificationsEnabledAt,
});
