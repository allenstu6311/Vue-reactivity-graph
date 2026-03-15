import { describe, it, expect, beforeEach } from "vitest";
import { collectSetupState, bindSetupTrack, resolveDepNode } from "../tracker";
import type { GraphNode } from "../../graph/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRef() {
  return { dep: {}, __vrg_depKey: undefined as string | undefined };
}

function makeComputed() {
  return {
    fn: () => 0,
    flags: 0,
    globalVersion: 0,
    value: 42,
    onTrack: undefined as ((e: any) => void) | undefined,
    __vrg_depKey: undefined as string | undefined,
  };
}

function makeStore() {
  return { _key: "useCartStore", __vrg_depKey: undefined as string | undefined };
}

function makeReactive() {
  return { items: [1, 2], note: "hi" };
}

function makeNode(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: "Comp.x",
    varName: "x",
    type: "ref",
    val: null,
    file: "Test.vue",
    deps: [],
    subs: [],
    ...overrides,
  };
}

// ── collectSetupState ─────────────────────────────────────────────────────────

describe("collectSetupState", () => {
  let nodes: GraphNode[];
  let valNodeMap: WeakMap<object, GraphNode>;

  beforeEach(() => {
    nodes = [];
    valNodeMap = new WeakMap();
  });

  it("creates a ref node for val with .dep", () => {
    const count = makeRef();
    collectSetupState({
      rawSetupState: { count } as any,
      componentName: "Comp",
      file: "Comp.vue",
      nodes,
      valNodeMap,
    });

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: "Comp.count",
      varName: "count",
      type: "ref",
      file: "Comp.vue",
      deps: [],
      subs: [],
    });
    expect(valNodeMap.get(count)).toBe(nodes[0]);
  });

  it("creates a computed node for val with .fn", () => {
    const double = makeComputed();
    collectSetupState({
      rawSetupState: { double } as any,
      componentName: "Comp",
      file: "Comp.vue",
      nodes,
      valNodeMap,
    });

    expect(nodes[0]).toMatchObject({ id: "Comp.double", type: "computed" });
    expect(valNodeMap.get(double)).toBe(nodes[0]);
  });

  it("creates a store node for val with ._key", () => {
    const cart = makeStore();
    collectSetupState({
      rawSetupState: { cart } as any,
      componentName: "Comp",
      file: "Comp.vue",
      nodes,
      valNodeMap,
    });

    expect(nodes[0]).toMatchObject({ id: "Comp.cart", type: "store" });
  });

  it("creates a reactive node for plain objects", () => {
    const form = makeReactive();
    collectSetupState({
      rawSetupState: { form } as any,
      componentName: "Comp",
      file: "Comp.vue",
      nodes,
      valNodeMap,
    });

    expect(nodes[0]).toMatchObject({ id: "Comp.form", type: "reactive" });
  });

  it("skips the 'props' key", () => {
    collectSetupState({
      rawSetupState: { props: { foo: 1 } } as any,
      componentName: "Comp",
      file: "Comp.vue",
      nodes,
      valNodeMap,
    });

    expect(nodes).toHaveLength(0);
  });

  it("skips non-object values", () => {
    collectSetupState({
      rawSetupState: { count: 42, name: "hello", flag: true } as any,
      componentName: "Comp",
      file: "Comp.vue",
      nodes,
      valNodeMap,
    });

    expect(nodes).toHaveLength(0);
  });

  it("skips null", () => {
    collectSetupState({
      rawSetupState: { nothing: null } as any,
      componentName: "Comp",
      file: "Comp.vue",
      nodes,
      valNodeMap,
    });

    expect(nodes).toHaveLength(0);
  });

  it("sets __vrg_depKey on the val", () => {
    const count = makeRef();
    collectSetupState({
      rawSetupState: { count } as any,
      componentName: "Comp",
      file: "Comp.vue",
      nodes,
      valNodeMap,
    });

    expect(count.__vrg_depKey).toBe("count");
  });

  it("filters __v_ prefixed keys from reactive snapshot", () => {
    const form = { __v_isReactive: true, items: [1, 2], __vrg_depKey: "old" };
    collectSetupState({
      rawSetupState: { form } as any,
      componentName: "Comp",
      file: "Comp.vue",
      nodes,
      valNodeMap,
    });

    const node = nodes[0];
    expect(node.type).toBe("reactive");
    // val snapshot must not contain __v_ keys or __vrg_depKey
    const snapshot = node.val as Record<string, unknown>;
    expect(snapshot).not.toHaveProperty("__v_isReactive");
    expect(snapshot).not.toHaveProperty("__vrg_depKey");
    expect(snapshot).toHaveProperty("items");
  });
});

// ── bindSetupTrack ────────────────────────────────────────────────────────────

describe("bindSetupTrack", () => {
  let valNodeMap: WeakMap<object, GraphNode>;
  let propKeyNodeMap: WeakMap<object, Map<string, GraphNode>>;

  beforeEach(() => {
    valNodeMap = new WeakMap();
    propKeyNodeMap = new WeakMap();
  });

  it("sets onTrack on computed vals", () => {
    const double = makeComputed();
    bindSetupTrack({
      rawSetupState: { double } as any,
      componentName: "Comp",
      valNodeMap,
      propKeyNodeMap,
    });

    expect(typeof double.onTrack).toBe("function");
  });

  it("onTrack adds dep to computed node deps", () => {
    const count = makeRef();
    const double = makeComputed();
    count.__vrg_depKey = "count";

    const countNode = makeNode({ id: "Comp.count", varName: "count", type: "ref", val: count });
    const doubleNode = makeNode({ id: "Comp.double", varName: "double", type: "computed", val: double });

    valNodeMap.set(count, countNode);
    valNodeMap.set(double, doubleNode);

    bindSetupTrack({
      rawSetupState: { count, double } as any,
      componentName: "Comp",
      valNodeMap,
      propKeyNodeMap,
    });

    // fire onTrack: double reads count
    double.onTrack!({ target: count, key: "value" });

    expect(doubleNode.deps).toContain("count");
  });

  it("onTrack adds sub to dep node subs (via valNodeMap.get(target))", () => {
    const count = makeRef();
    const double = makeComputed();
    count.__vrg_depKey = "count";

    const countNode = makeNode({ id: "Comp.count", varName: "count", type: "ref", val: count });
    const doubleNode = makeNode({ id: "Comp.double", varName: "double", type: "computed", val: double });

    valNodeMap.set(count, countNode);
    valNodeMap.set(double, doubleNode);

    bindSetupTrack({
      rawSetupState: { count, double } as any,
      componentName: "Comp",
      valNodeMap,
      propKeyNodeMap,
    });

    double.onTrack!({ target: count, key: "value" });

    expect(countNode.subs).toContain("double");
  });

  it("onTrack resolves dep via rawSetupState[depName] (pinia store state)", () => {
    const storeState = { $id: "cart" }; // no __vrg_depKey on storeState itself
    const double = makeComputed();

    // storeState target has no __vrg_depKey, so depName falls back to event.key
    // The store ref lives at rawSetupState["total"]
    const totalRef = makeRef();
    totalRef.__vrg_depKey = undefined; // no key on the target

    const totalNode = makeNode({ id: "Comp.total", varName: "total", type: "ref", val: totalRef });
    const doubleNode = makeNode({ id: "Comp.double", varName: "double", type: "computed", val: double });

    valNodeMap.set(totalRef, totalNode);
    valNodeMap.set(double, doubleNode);

    bindSetupTrack({
      rawSetupState: { total: totalRef, double } as any,
      componentName: "Comp",
      valNodeMap,
      propKeyNodeMap,
    });

    // target has no __vrg_depKey → depName = String(event.key) = "total"
    // depNode = valNodeMap.get(rawSetupState["total"]) = totalNode
    double.onTrack!({ target: storeState, key: "total" });

    expect(doubleNode.deps).toContain("total");
    expect(totalNode.subs).toContain("double");
  });

  it("onTrack resolves dep via propKeyNodeMap (prop)", () => {
    const rawProps = {};
    const double = makeComputed();
    const doubleNode = makeNode({ id: "Comp.double", varName: "double", type: "computed", val: double });
    const priceNode = makeNode({ id: "Comp.price", varName: "price", type: "prop" });

    valNodeMap.set(double, doubleNode);
    propKeyNodeMap.set(rawProps, new Map([["price", priceNode]]));

    bindSetupTrack({
      rawSetupState: { double } as any,
      componentName: "Comp",
      valNodeMap,
      propKeyNodeMap,
    });

    // target = rawProps (no __vrg_depKey), key = "price"
    double.onTrack!({ target: rawProps, key: "price" });

    expect(doubleNode.deps).toContain("price");
    expect(priceNode.subs).toContain("Comp.double");
  });

  it("onTrack does not add duplicate deps or subs", () => {
    const count = makeRef();
    const double = makeComputed();
    count.__vrg_depKey = "count";

    const countNode = makeNode({ id: "Comp.count", varName: "count", type: "ref", val: count });
    const doubleNode = makeNode({ id: "Comp.double", varName: "double", type: "computed", val: double });

    valNodeMap.set(count, countNode);
    valNodeMap.set(double, doubleNode);

    bindSetupTrack({
      rawSetupState: { count, double } as any,
      componentName: "Comp",
      valNodeMap,
      propKeyNodeMap,
    });

    double.onTrack!({ target: count, key: "value" });
    double.onTrack!({ target: count, key: "value" });

    expect(doubleNode.deps.filter((d) => d === "count")).toHaveLength(1);
    expect(countNode.subs.filter((s) => s === "double")).toHaveLength(1);
  });
});

// ── resolveDepNode ────────────────────────────────────────────────────────────

describe("resolveDepNode", () => {
  it("resolves via valNodeMap.get(target)", () => {
    const target = {};
    const node = makeNode({});
    const valNodeMap = new WeakMap([[target, node]]);
    const propKeyNodeMap = new WeakMap<object, Map<string, GraphNode>>();

    const result = resolveDepNode(target, "x", "x", {} as any, valNodeMap, propKeyNodeMap);
    expect(result).toBe(node);
  });

  it("resolves via rawSetupState[depName] when target not in valNodeMap", () => {
    const target = {};
    const stateVal = {};
    const node = makeNode({});
    const valNodeMap = new WeakMap([[stateVal, node]]);
    const propKeyNodeMap = new WeakMap<object, Map<string, GraphNode>>();

    const result = resolveDepNode(target, "foo", "foo", { foo: stateVal } as any, valNodeMap, propKeyNodeMap);
    expect(result).toBe(node);
  });

  it("resolves via propKeyNodeMap when first two miss", () => {
    const target = {};
    const node = makeNode({ type: "prop" });
    const valNodeMap = new WeakMap<object, GraphNode>();
    const propKeyNodeMap = new WeakMap([[target, new Map([["price", node]])]]);

    const result = resolveDepNode(target, "price", "price", {} as any, valNodeMap, propKeyNodeMap);
    expect(result).toBe(node);
  });

  it("returns undefined when nothing matches", () => {
    const valNodeMap = new WeakMap<object, GraphNode>();
    const propKeyNodeMap = new WeakMap<object, Map<string, GraphNode>>();

    const result = resolveDepNode({}, "x", "x", {} as any, valNodeMap, propKeyNodeMap);
    expect(result).toBeUndefined();
  });
});
