import { prisma } from "@alphasignal/db";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import { getRedisClient } from "../config/redis.js";
import { AlgoController } from "../controllers/algo.controller.js";
import { AdminController } from "../controllers/admin.controller.js";
import { AuthController } from "../controllers/auth.controller.js";
import { BillingController } from "../controllers/billing.controller.js";
import { HealthController } from "../controllers/health.controller.js";
import { MarketController } from "../controllers/market.controller.js";
import { NotificationController } from "../controllers/notification.controller.js";
import { ProviderController } from "../controllers/provider.controller.js";
import { SignalController } from "../controllers/signal.controller.js";
import { TelegramController } from "../controllers/telegram.controller.js";
import { UsersController } from "../controllers/users.controller.js";
import { WatchlistController } from "../controllers/watchlist.controller.js";
import { AlpacaIntegration } from "../integrations/alpaca.js";
import { AlphaVantageIntegration } from "../integrations/alpha-vantage.js";
import { AnthropicIntegration } from "../integrations/anthropic.js";
import { BinanceIntegration } from "../integrations/binance.js";
import { ExternalQuotaTracker } from "../integrations/external-quota.js";
import { PolygonIntegration } from "../integrations/polygon.js";
import { ResendIntegration } from "../integrations/resend.js";
import { TelegramIntegration } from "../integrations/telegram.js";
import { StripeIntegration } from "../integrations/stripe.js";
import { YahooFinanceIntegration } from "../integrations/yahoo-finance.js";
import { AiAnalysisProcessor } from "../jobs/ai-analysis.processor.js";
import { AlgoScanProcessor } from "../jobs/algo-scan.processor.js";
import { JobManager } from "../jobs/job-manager.js";
import { NotificationProcessor } from "../jobs/notification.processor.js";
import { AuthMiddleware } from "../middleware/auth.middleware.js";
import { RateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import { AlgoRepository } from "../repositories/algo.repository.js";
import { AdminRepository } from "../repositories/admin.repository.js";
import { AuthRepository } from "../repositories/auth.repository.js";
import { BillingRepository } from "../repositories/billing.repository.js";
import { HealthRepository } from "../repositories/health.repository.js";
import { NotificationRepository } from "../repositories/notification.repository.js";
import { ProviderRepository } from "../repositories/provider.repository.js";
import { SignalRepository } from "../repositories/signal.repository.js";
import { WatchlistRepository } from "../repositories/watchlist.repository.js";
import { AlgoService } from "../services/algo.service.js";
import { AdminService } from "../services/admin.service.js";
import { AuthService } from "../services/auth.service.js";
import { BillingService } from "../services/billing.service.js";
import { EmailService } from "../services/email.service.js";
import { HealthService } from "../services/health.service.js";
import { MarketDataService } from "../services/market-data.service.js";
import { NotificationService } from "../services/notification.service.js";
import { ProviderService } from "../services/provider.service.js";
import { PlanEnforcementService } from "../services/plan-enforcement.service.js";
import { SignalService } from "../services/signal.service.js";
import { TelegramLinkService } from "../services/telegram-link.service.js";
import { TokenService } from "../services/token.service.js";
import { WatchlistService } from "../services/watchlist.service.js";
import { WebSocketHub } from "../websocket/websocket-hub.js";
import { registerAlgoRoutes } from "./algo.routes.js";
import { registerAdminRoutes } from "./admin.routes.js";
import { registerAuthRoutes } from "./auth.routes.js";
import { registerBillingRoutes } from "./billing.routes.js";
import { registerHealthRoutes } from "./health.routes.js";
import { registerMarketRoutes } from "./market.routes.js";
import { registerNotificationRoutes } from "./notification.routes.js";
import { registerProviderRoutes } from "./provider.routes.js";
import { registerSignalRoutes } from "./signal.routes.js";
import { registerTelegramRoutes } from "./telegram.routes.js";
import { registerUsersRoutes } from "./users.routes.js";
import { registerWatchlistRoutes } from "./watchlist.routes.js";

export interface ApiRuntime {
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function registerRoutes(app: FastifyInstance, config: AppConfig): Promise<ApiRuntime> {
  const redis = getRedisClient(config);
  const healthRepository = new HealthRepository(prisma);
  const healthService = new HealthService(healthRepository, redis);
  const healthController = new HealthController(healthService);
  const authRepository = new AuthRepository(prisma);
  const tokenService = new TokenService(config);
  const resendIntegration = new ResendIntegration(config, app.log);
  const telegramIntegration = new TelegramIntegration(config, app.log);
  const emailService = new EmailService(config, resendIntegration);
  const authService = new AuthService(authRepository, tokenService, emailService);
  const authController = new AuthController(config, authService);
  const usersController = new UsersController(authService);
  const authMiddleware = new AuthMiddleware(tokenService, authService);
  const rateLimits = new RateLimitMiddleware(redis);
  const planEnforcement = new PlanEnforcementService(redis);
  const externalQuota = new ExternalQuotaTracker(redis, config, app.log);
  const anthropic = new AnthropicIntegration(config, externalQuota, app.log);
  const yahooFinance = new YahooFinanceIntegration(config, app.log);
  const marketDataService = new MarketDataService(
    redis,
    {
      STOCKS: new AlpacaIntegration(config, externalQuota, app.log),
      CRYPTO: new BinanceIntegration(config, externalQuota, app.log),
      FOREX: new AlphaVantageIntegration(config, externalQuota, app.log),
      FUTURES: new PolygonIntegration(config, yahooFinance, app.log),
    },
    app.log,
  );
  const marketController = new MarketController(marketDataService);
  const websocket = new WebSocketHub(
    app.server,
    redis,
    tokenService,
    authService,
    marketDataService,
    config.FRONTEND_URL,
    app.log,
  );
  const jobs = new JobManager(config, redis, app.log);
  const signalRepository = new SignalRepository(prisma);
  const signalService = new SignalService(signalRepository, jobs, websocket);
  const signalController = new SignalController(signalService, planEnforcement);
  const algoRepository = new AlgoRepository(prisma);
  const algoService = new AlgoService(algoRepository, signalService, jobs, websocket);
  const algoController = new AlgoController(algoService, planEnforcement);
  const scanner = new AlgoScanProcessor(algoRepository, marketDataService, signalService, algoService, app.log);
  const aiAnalysis = new AiAnalysisProcessor(marketDataService, anthropic, redis, websocket, app.log);
  const notificationRepository = new NotificationRepository(prisma);
  const notificationService = new NotificationService(
    config,
    notificationRepository,
    resendIntegration,
    telegramIntegration,
    websocket,
    app.log,
  );
  const notificationController = new NotificationController(notificationService, planEnforcement);
  const notifications = new NotificationProcessor(notificationService);
  const telegramLinkService = new TelegramLinkService(config, redis, authRepository, telegramIntegration);
  const telegramController = new TelegramController(telegramLinkService, planEnforcement);
  const providerRepository = new ProviderRepository(prisma);
  const providerService = new ProviderService(providerRepository);
  const providerController = new ProviderController(providerService, planEnforcement);
  const watchlistRepository = new WatchlistRepository(prisma);
  const watchlistService = new WatchlistService(watchlistRepository);
  const watchlistController = new WatchlistController(watchlistService);
  const stripeIntegration = new StripeIntegration(config, app.log);
  const billingService = new BillingService(config, new BillingRepository(prisma), stripeIntegration);
  const billingController = new BillingController(billingService);
  const adminController = new AdminController(new AdminService(new AdminRepository(prisma)));

  await registerHealthRoutes(app, healthController);
  await registerAuthRoutes(app, authController, authMiddleware, rateLimits, tokenService);
  await registerUsersRoutes(app, usersController, authMiddleware, rateLimits);
  await registerMarketRoutes(app, marketController, authMiddleware, rateLimits);
  await registerSignalRoutes(app, signalController, authMiddleware, rateLimits);
  await registerAlgoRoutes(app, algoController, authMiddleware, rateLimits);
  await registerNotificationRoutes(app, notificationController, authMiddleware, rateLimits);
  await registerTelegramRoutes(app, telegramController, authMiddleware, rateLimits);
  await registerProviderRoutes(app, providerController, authMiddleware, rateLimits);
  await registerWatchlistRoutes(app, watchlistController, authMiddleware, rateLimits);
  await registerBillingRoutes(app, billingController, authMiddleware, rateLimits);
  await registerAdminRoutes(app, adminController, authMiddleware, rateLimits);

  return {
    async start() {
      await websocket.start();
      await jobs.start({ scanner, aiAnalysis, notifications });
    },
    async close() {
      await jobs.close();
      await websocket.close();
    },
  };
}
