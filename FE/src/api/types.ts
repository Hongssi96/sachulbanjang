export interface Pagination {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

export interface ListResponse<T> {
  items: T[];
  pagination: Pagination;
}
