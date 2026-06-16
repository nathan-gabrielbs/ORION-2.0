export type UserRole = "ADMIN" | "USER";
export type AuthProvider = "LOCAL" | "ORBITAL";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  auth_provider: AuthProvider;
  active: number;
};
