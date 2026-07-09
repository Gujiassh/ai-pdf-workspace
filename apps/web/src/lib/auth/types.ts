export type AuthUser = {
  userId: string;
  email: string;
  name: string;
  avatarUrl: string;
};

export type AuthApiUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
};

export type AuthErrorPayload = {
  detail?: string;
  error?: {
    message?: string;
  };
};
