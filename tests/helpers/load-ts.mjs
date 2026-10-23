import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";

export function createLoader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file);
    cache.set(file, mod);
    mod.require = (specifier) => {
      if (specifier in stubs) return stubs[specifier];
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const base = specifier.startsWith("@/")
          ? path.resolve(specifier.slice(2))
          : path.resolve(path.dirname(file), specifier);
        for (const extension of [".ts", ".tsx"])
          if (fs.existsSync(base + extension)) return load(base + extension);
      }
      return createRequire(file)(specifier);
    };
    mod._compile(
      ts.transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText,
      file,
    );
    return mod.exports;
  }
  return load;
}
