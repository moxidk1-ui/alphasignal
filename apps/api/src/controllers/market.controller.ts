import {
  marketOhlcvQuerySchema,
  marketQuoteQuerySchema,
  marketSearchQuerySchema,
} from "@alphasignal/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { MarketDataService } from "../services/market-data.service.js";

export class MarketController {
  constructor(private readonly marketDataService: MarketDataService) {}

  quote = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = marketQuoteQuerySchema.parse(request.query);
    const quote = await this.marketDataService.getQuote(query.ticker, query.market);
    await reply.code(200).send({ quote });
  };

  ohlcv = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = marketOhlcvQuerySchema.parse(request.query);
    const candles = await this.marketDataService.getOHLCV(
      query.ticker,
      query.market,
      query.timeframe,
      query.limit,
    );
    await reply.code(200).send({ candles });
  };

  search = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = marketSearchQuerySchema.parse(request.query);
    const tickers = await this.marketDataService.searchTickers(query.q, query.market);
    await reply.code(200).send({ tickers });
  };
}
