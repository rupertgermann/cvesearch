import Module from "node:module";
import path from "node:path";

// Compiled route handlers import "@/..."; map it onto the compiled src tree so tests can load them.
const srcRoot = path.join(__dirname, "..", "..", "src");
const moduleWithResolver = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const originalResolve = moduleWithResolver._resolveFilename;
moduleWithResolver._resolveFilename = function (request: string, ...rest: unknown[]) {
  const mapped = request.startsWith("@/") ? path.join(srcRoot, request.slice(2)) : request;
  return originalResolve.call(this, mapped, ...rest);
};
