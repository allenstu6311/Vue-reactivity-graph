export const isObject = (val: unknown): val is object =>
  typeof val === "object" && val !== null;

export const isString = (val: unknown): val is string =>
  typeof val === "string";

export const isSymbol = (val: unknown): val is symbol =>
  typeof val === "symbol";

export const isFunction = (val: unknown): val is Function =>
  typeof val === "function";
