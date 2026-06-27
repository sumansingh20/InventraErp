'use strict';

/**
 * API Features helper for filtering, sorting, pagination, field limiting
 */
class APIFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
    this.page = 1;
    this.limit = 25;
    this.queryFilter = {};
  }
  
  filter() {
    const queryObj = { ...this.queryString };
    const excludedFields = ['page', 'sort', 'limit', 'fields', 'search', 'from', 'to'];
    excludedFields.forEach(f => delete queryObj[f]);
    
    // Advanced filtering: gte, gt, lte, lt operators
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt|in|nin|ne)\b/g, match => `$${match}`);
    
    const filter = JSON.parse(queryStr);
    
    // Date range
    if (this.queryString.from || this.queryString.to) {
      filter.createdAt = {};
      if (this.queryString.from) filter.createdAt.$gte = new Date(this.queryString.from);
      if (this.queryString.to) filter.createdAt.$lte = new Date(this.queryString.to);
    }
    
    // Search
    if (this.queryString.search) {
      filter.$text = { $search: this.queryString.search };
    }
    
    this.queryFilter = filter;
    this.query = this.query.find(filter);
    return this;
  }
  
  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort('-createdAt');
    }
    return this;
  }
  
  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    }
    return this;
  }
  
  paginate() {
    this.page = parseInt(this.queryString.page) || 1;
    this.limit = Math.min(parseInt(this.queryString.limit) || 25, 200);
    const skip = (this.page - 1) * this.limit;
    this.query = this.query.skip(skip).limit(this.limit);
    return this;
  }
}

module.exports = APIFeatures;
