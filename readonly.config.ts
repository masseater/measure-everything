import type { OxlintConfig } from "vite-plus/lint";

type RuleConfig =
  Extract<
    NonNullable<OxlintConfig["rules"]>["typescript/prefer-readonly-parameter-types"],
    readonly [unknown, unknown]
  > extends readonly [unknown, infer Config]
    ? Config
    : never;

const readonlyParameterTypes: RuleConfig = {
  ignoreInferredTypes: true,
  allow: [
    { from: "lib", name: "Request" },
    { from: "lib", name: "Response" },
    { from: "lib", name: "Uint8Array" },
    { from: "lib", name: "Date" },
    {
      from: "package",
      package: "@bufbuild/protobuf",
      name: ["DescMessage", "JsonObject", "JsonValue", "Message"],
    },
    { from: "package", package: "lighthouse", name: ["FlowResult", "Step"] },
    { from: "package", package: "vitest", name: "TestProject" },
    {
      from: "package",
      package: "@cloudflare/workers-types",
      name: [
        "TailEvent",
        "Onset",
        "Log",
        "Exception",
        "Attribute",
        "SpanUpdateInfo",
        "FetchResponseInfo",
        "KVNamespace",
        "Span",
      ],
    },
    { from: "package", package: "puppeteer-core", name: ["Browser", "Page"] },
    { from: "package", package: "miniflare", name: "Miniflare" },
    { from: "package", package: "elysia", name: "ElysiaConfig" },
    { from: "package", package: "@alchemy.run/cloudflare", name: "WorkerProps" },
    { from: "package", package: "@types/node", name: ["Request", "Response"] },
    {
      from: "package",
      package: "effect",
      name: [
        "Cause",
        "Context",
        "Duration",
        "Effect",
        "Exit",
        "Fiber",
        "HttpServerRequest",
        "HttpServerResponse",
        "Layer",
        "Logger",
        "NativeSpan",
        "Option",
      ],
    },
  ],
};

export type { RuleConfig };
export { readonlyParameterTypes };
