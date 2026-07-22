import { billingCheckoutSchema } from "@alphasignal/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { BillingService } from "../services/billing.service.js";
import { badRequest } from "../utils/errors.js";

export class BillingController {
  constructor(private readonly billing: BillingService) {}

  plans = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await reply.code(200).send({ plans: this.billing.plans() });
  };

  checkout = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const session = await this.billing.checkout(request.auth!.user, billingCheckoutSchema.parse(request.body));
    await reply.code(201).send(session);
  };

  portal = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await reply.code(201).send(await this.billing.portal(request.auth!.user));
  };

  webhook = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!Buffer.isBuffer(request.body)) {
      throw badRequest("Stripe webhook payload must be raw JSON.");
    }
    const header = request.headers["stripe-signature"];
    await this.billing.processWebhook(request.body, typeof header === "string" ? header : undefined);
    await reply.code(204).send();
  };
}
