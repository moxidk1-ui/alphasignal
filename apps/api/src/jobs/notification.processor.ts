import type { NotificationJobData } from "@alphasignal/queue";
import type { NotificationService } from "../services/notification.service.js";

export class NotificationProcessor {
  constructor(private readonly notifications: NotificationService) {}

  process(data: NotificationJobData) {
    return this.notifications.process(data);
  }
}
