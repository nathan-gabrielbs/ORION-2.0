export type UserRole = "ADMIN" | "USER";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  auth_provider: "LOCAL" | "ORBITAL";
  active: number;
}

export interface ManagedUser extends AuthUser {
  created_at: string;
  updated_at: string;
  last_login: string | null;
}
