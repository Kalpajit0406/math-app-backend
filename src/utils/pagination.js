/**
 * Pagination Utility
 * Provides consistent pagination across all endpoints
 */

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

class PaginationParams {
  constructor(req) {
    const page = Math.max(1, parseInt(req.query.page || 1, 10));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(req.query.pageSize || DEFAULT_PAGE_SIZE, 10))
    );

    this.page = page;
    this.pageSize = pageSize;
    this.skip = (page - 1) * pageSize;
    this.limit = pageSize;
  }

  toQuery() {
    return {
      skip: this.skip,
      limit: this.limit,
    };
  }

  toMeta(total) {
    return {
      currentPage: this.page,
      pageSize: this.pageSize,
      total,
      totalPages: Math.ceil(total / this.pageSize),
      hasMore: this.page * this.pageSize < total,
    };
  }
}

/**
 * Mongoose pagination helper
 */
async function paginate(model, query = {}, pagination, sort = { createdAt: -1 }) {
  const total = await model.countDocuments(query);
  const data = await model
    .find(query)
    .sort(sort)
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean();

  return {
    data,
    pagination: pagination.toMeta(total),
  };
}

/**
 * Aggregation pipeline pagination
 */
async function paginateAggregation(model, pipeline, pagination) {
  const countPipeline = [...pipeline, { $count: 'total' }];
  
  const [countResult] = await model.aggregate(countPipeline);
  const total = countResult?.total || 0;

  const dataPipeline = [
    ...pipeline,
    { $skip: pagination.skip },
    { $limit: pagination.limit },
  ];

  const data = await model.aggregate(dataPipeline);

  return {
    data,
    pagination: pagination.toMeta(total),
  };
}

/**
 * Format paginated response
 */
function formatPaginatedResponse(data, pagination, success = true) {
  return {
    success,
    data,
    pagination,
  };
}

module.exports = {
  PaginationParams,
  paginate,
  paginateAggregation,
  formatPaginatedResponse,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
};
