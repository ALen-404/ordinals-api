import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { FastifyPluginAsync, FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  BlockHeightParam,
  Brc20MintResponseSchema,
  Brc20StatResponseSchema,
  InscriptionsPerBlockResponse,
  LimitParam,
  NotFoundResponse,
  OffsetParam,
  PaginatedResponse,
} from '../schemas';
import { handleInscriptionsPerBlockCache } from '../util/cache';
import { DEFAULT_API_LIMIT, blockParam, parseBrc20MintFlow } from '../util/helpers';

const IndexRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.addHook('preHandler', handleInscriptionsPerBlockCache);
  fastify.get(
    '/stats/inscriptions',
    {
      schema: {
        operationId: 'getStatsInscriptionCount',
        summary: 'Inscription Count per Block',
        description: 'Retrieves statistics on the number of inscriptions revealed per block',
        tags: ['Statistics'],
        querystring: Type.Object({
          from_block_height: Type.Optional(BlockHeightParam),
          to_block_height: Type.Optional(BlockHeightParam),
        }),
        response: {
          200: InscriptionsPerBlockResponse,
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const inscriptions = await fastify.db.getInscriptionCountPerBlock({
        ...blockParam(request.query.from_block_height, 'from_block'),
        ...blockParam(request.query.to_block_height, 'to_block'),
      });
      await reply.send({
        results: inscriptions,
      });
    }
  );
  done();
};

const Brc20Routes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.get(
    '/stats/brc-20',
    {
      schema: {
        operationId: 'getStatsBRC20',
        summary: 'Total brc20 stat',
        description: 'Retrieve total statistics of BRC20',
        tags: ['Statistics'],
        response: {
          200: Brc20StatResponseSchema,
          404: NotFoundResponse,
        },
      },
    },
    async (_, reply) => {
      const stat = await fastify.db.brc20.getStat();
      await reply.send(stat);
    }
  );

  fastify.get(
    '/stats/brc-20/mints',
    {
      schema: {
        operationId: 'getStatsBRC20MintCount',
        summary: 'Mint Count per Token',
        description: 'Retrieve statistics of BRC20 currency mint count based on block height',
        tags: ['Statistics'],
        querystring: Type.Object({
          block_offset: Type.RegEx(/^[1-9]\d*[bd]$/, {
            examples: ['1b', '1d'],
          }),
          // Pagination
          offset: Type.Optional(OffsetParam),
          limit: Type.Optional(LimitParam),
        }),
        response: {
          200: PaginatedResponse(Brc20MintResponseSchema, 'Paginated Brc20 Mint Flow Response'),
          404: NotFoundResponse,
        },
      },
    },
    async (request, reply) => {
      const limit = request.query.limit ?? DEFAULT_API_LIMIT;
      const offset = request.query.offset ?? 0;
      const flowResult = await fastify.db.brc20.getMintFlow({
        block_offset: request.query.block_offset,
        limit,
        offset,
      });
      if (!flowResult) {
        await reply.code(404).send(Value.Create(NotFoundResponse));
        return;
      }
      await reply.send({
        limit,
        offset,
        total: flowResult.total,
        results: parseBrc20MintFlow(flowResult.results),
      });
    }
  );
  done();
};

export const StatsRoutes: FastifyPluginAsync<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async fastify => {
  await fastify.register(IndexRoutes);
  await fastify.register(Brc20Routes);
};
