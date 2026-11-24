import { apiRequest } from './client';
import {
  asArray,
  asNullableNumber,
  asNullableString,
  asNumber,
  asRecord,
  asString,
  toQuery,
} from './json';

export interface Department {
  department_id: number;
  code: string;
  name: string;
}

export interface ProductionLine {
  production_line_id: number;
  department_id: number;
  code: string;
  name: string;
}

export interface Equipment {
  equipment_id: number;
  equipment_code: string;
  name: string;
  production_line_id: number | null;
}

export interface Product {
  product_id: number;
  product_code: string | null;
  name: string;
}

export interface MyAssignments {
  departments: Department[];
  production_lines: ProductionLine[];
  equipment: Equipment[];
}

function parseDepartment(value: unknown, field: string): Department {
  const item = asRecord(value, field);
  return {
    department_id: asNumber(item.department_id, `${field}.department_id`),
    code: asString(item.code, `${field}.code`),
    name: asString(item.name, `${field}.name`),
  };
}

function parseProductionLine(value: unknown, field: string): ProductionLine {
  const item = asRecord(value, field);
  return {
    production_line_id: asNumber(item.production_line_id, `${field}.production_line_id`),
    department_id: asNumber(item.department_id, `${field}.department_id`),
    code: asString(item.code, `${field}.code`),
    name: asString(item.name, `${field}.name`),
  };
}

function parseEquipment(value: unknown, field: string): Equipment {
  const item = asRecord(value, field);
  return {
    equipment_id: asNumber(item.equipment_id, `${field}.equipment_id`),
    equipment_code: asString(item.equipment_code, `${field}.equipment_code`),
    name: asString(item.name, `${field}.name`),
    production_line_id: asNullableNumber(item.production_line_id, `${field}.production_line_id`),
  };
}

function parseProduct(value: unknown, field: string): Product {
  const item = asRecord(value, field);
  return {
    product_id: asNumber(item.product_id, `${field}.product_id`),
    product_code: asNullableString(item.product_code, `${field}.product_code`),
    name: asString(item.name, `${field}.name`),
  };
}

function parseItems<T>(payload: unknown, parseItem: (value: unknown, field: string) => T): T[] {
  return asArray(asRecord(payload, 'response').items, 'response.items').map((item, index) =>
    parseItem(item, `items[${index}]`),
  );
}

export async function fetchDepartments(): Promise<Department[]> {
  const payload = await apiRequest<unknown>('/departments');
  return parseItems(payload, parseDepartment);
}

export async function fetchProductionLines(departmentId?: number): Promise<ProductionLine[]> {
  const payload = await apiRequest<unknown>(
    `/production-lines${toQuery({ department_id: departmentId })}`,
  );
  return parseItems(payload, parseProductionLine);
}

export async function fetchEquipment(productionLineId?: number): Promise<Equipment[]> {
  const payload = await apiRequest<unknown>(
    `/equipment${toQuery({ production_line_id: productionLineId })}`,
  );
  return parseItems(payload, parseEquipment);
}

export async function fetchProducts(query?: string): Promise<Product[]> {
  const payload = await apiRequest<unknown>(`/products${toQuery({ q: query })}`);
  return parseItems(payload, parseProduct);
}

export async function fetchMyAssignments(): Promise<MyAssignments> {
  const payload = asRecord(await apiRequest<unknown>('/assignments/me'), 'response');
  return {
    departments: asArray(payload.departments, 'departments').map((item, index) =>
      parseDepartment(item, `departments[${index}]`),
    ),
    production_lines: asArray(payload.production_lines, 'production_lines').map((item, index) =>
      parseProductionLine(item, `production_lines[${index}]`),
    ),
    equipment: asArray(payload.equipment, 'equipment').map((item, index) =>
      parseEquipment(item, `equipment[${index}]`),
    ),
  };
}
