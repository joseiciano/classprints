import { request } from './http';

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  emailNotificationsEnabledAt: string | null;
}

export interface UpdateEmailNotificationsResponse {
  emailNotificationsEnabledAt: string | null;
}

export const fetchUserProfile = () => request<UserProfile>('/user/profile');

export const updateEmailNotifications = (enabled: boolean) =>
  request<UpdateEmailNotificationsResponse>('/user/email-notifications', {
    method: 'POST',
    body: { enabled },
  });
