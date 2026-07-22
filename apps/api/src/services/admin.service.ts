import type { AdminUsersQueryInput, AdminUpdateRoleInput } from "@alphasignal/shared";
import type { AdminRepository } from "../repositories/admin.repository.js";

export class AdminService {
  constructor(private readonly repository: AdminRepository) {}

  users(input: AdminUsersQueryInput) {
    return this.repository.listUsers(input);
  }

  updateRole(userId: string, input: AdminUpdateRoleInput) {
    return this.repository.updateRole(userId, input.role);
  }

  stats() {
    return this.repository.stats();
  }

  detections(page: number, pageSize: number) {
    return this.repository.listDetections(page, pageSize);
  }
}
