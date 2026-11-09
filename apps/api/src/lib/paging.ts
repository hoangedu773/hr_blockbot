import type { PaginationMeta } from "@hr-blockbot/contracts";

export interface PagingParams {
  page: number;
  limit: number;
  totalItems: number;
}

export type PagingMeta = PaginationMeta;

export function pagingMeta({ page, limit, totalItems }: PagingParams): PaginationMeta {
  return {
    page,
    limit,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    hasNext: page * limit < totalItems,
    hasPrev: page > 1,
  };
}
