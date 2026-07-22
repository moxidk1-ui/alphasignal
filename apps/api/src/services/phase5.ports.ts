import type {
  AiAnalysisJobData,
  NotificationJobData,
} from "@alphasignal/queue";
import type { AiSignalRecommendation } from "@alphasignal/shared";

export interface RealtimePublisher {
  publishToUser(userId: string, event: string, payload: unknown): Promise<void>;
  publishToUsers(userIds: string[], event: string, payload: unknown): Promise<void>;
}

export interface JobPublisher {
  enqueueAiAnalysis(data: AiAnalysisJobData): Promise<{ id: string }>;
  getAiAnalysisStatus(jobId: string, requesterId: string): Promise<{
    status: "WAITING" | "ACTIVE" | "COMPLETED" | "FAILED";
    result?: AiSignalRecommendation;
    error?: string;
  }>;
  enqueueNotification(data: NotificationJobData): Promise<void>;
}
